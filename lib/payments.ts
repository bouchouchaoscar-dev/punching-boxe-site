import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase";
import { getStripe } from "./stripe";
import {
  sendAdherentConfirmation,
  sendAdminNotification,
  sendPaiementEchec,
} from "./email";
import { notifierSiDossierComplet } from "./dossier-complet";
import type { Adherent, Paiement } from "./types";

/**
 * Marque un adhérent comme payé (idempotent) et déclenche les emails
 * uniquement lors de la transition réelle vers « payé ».
 * Conservé pour le flux 1x simple (filet de sécurité).
 */
export async function markAdherentPaid(
  adherentId: string,
  paymentIntentId?: string,
): Promise<{ updated: boolean; adherent?: Adherent }> {
  const supabase = getSupabaseAdmin();

  const { data: current, error: readErr } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", adherentId)
    .single();

  if (readErr || !current) return { updated: false };
  const adherent = current as Adherent;

  if (adherent.statut_paiement === "paye") {
    return { updated: false, adherent };
  }

  const { data: updated, error: updErr } = await supabase
    .from("adherents")
    .update({
      statut_paiement: "paye",
      ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
      // Engagement figé une seule fois (filet du flux comptant 1x).
      ...(adherent.engage_at ? {} : { engage_at: new Date().toISOString() }),
    })
    .eq("id", adherentId)
    .select()
    .single();

  if (updErr) return { updated: false, adherent };

  try {
    await Promise.all([
      sendAdherentConfirmation({ ...adherent, adherentId }),
      sendAdminNotification({ ...adherent, adherentId }),
    ]);
  } catch (e) {
    console.error("Email error (markAdherentPaid):", e);
  }

  // Paiement engagé → le dossier est peut-être complet (docs déjà validés).
  await notifierSiDossierComplet(supabase, adherentId);

  return { updated: true, adherent: updated as Adherent };
}

/**
 * Recalcule l'état de paiement d'un adhérent à partir de ses échéances :
 * - echeances_payees = nombre d'échéances (numéro non nul) payées
 * - prochaine_echeance = prochaine date prévue non payée
 * - statut « payé » + emails quand toutes les échéances sont réglées.
 */
export async function recalculerEtatPaiement(adherentId: string) {
  const supabase = getSupabaseAdmin();
  const { data: a } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", adherentId)
    .single();
  if (!a) return;
  const adherent = a as Adherent;

  const { data: paiements } = await supabase
    .from("paiements")
    .select("montant, statut, numero_echeance, date_prevue")
    .eq("adherent_id", adherentId);
  const rows = (paiements ?? []) as Pick<
    Paiement,
    "montant" | "statut" | "numero_echeance" | "date_prevue"
  >[];

  const echeancesPayees = rows.filter(
    (r) => r.numero_echeance != null && r.statut === "paye",
  ).length;
  const prochaine =
    rows
      .filter(
        (r) =>
          r.numero_echeance != null && r.statut !== "paye" && r.date_prevue,
      )
      .map((r) => r.date_prevue as string)
      .sort()[0] ?? null;

  const complet = echeancesPayees >= (adherent.nb_echeances || 1);
  // Inscription confirmée dès la 1ère échéance réglée (welcome email).
  const premierPaiement = (adherent.echeances_payees || 0) < 1 && echeancesPayees >= 1;
  // Dossier "engagé" dès la 1re échéance payée → on fige engage_at une seule fois.
  const devientEngage = echeancesPayees >= 1 && !adherent.engage_at;

  await supabase
    .from("adherents")
    .update({
      echeances_payees: echeancesPayees,
      prochaine_echeance: prochaine,
      ...(devientEngage ? { engage_at: new Date().toISOString() } : {}),
      ...(complet
        ? {
            statut_paiement: "paye",
            derniere_erreur_stripe: null,
            derniere_erreur_code: null,
          }
        : {}),
    })
    .eq("id", adherentId);

  if (premierPaiement) {
    const echeances = rows
      .filter((r) => r.numero_echeance != null && r.date_prevue)
      .sort((a, b) => (a.numero_echeance ?? 0) - (b.numero_echeance ?? 0))
      .map((r) => ({
        numero: r.numero_echeance as number,
        date: r.date_prevue as string,
        montant: Number(r.montant || 0),
      }));
    try {
      await Promise.all([
        sendAdherentConfirmation({ ...adherent, adherentId, echeances }),
        sendAdminNotification({ ...adherent, adherentId }),
      ]);
    } catch (e) {
      console.error("Email error (recalculerEtatPaiement):", e);
    }
  }

  // 1re échéance / solde → le dossier est peut-être complet (docs déjà validés).
  if (devientEngage || complet) {
    await notifierSiDossierComplet(supabase, adherentId);
  }
}

/** Marque l'échéance liée à un PaymentIntent comme payée. */
export async function marquerEcheancePayee(
  paymentIntentId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data: paiement } = await supabase
    .from("paiements")
    .select("id, adherent_id, statut")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!paiement) return false;

  if (paiement.statut !== "paye") {
    await supabase
      .from("paiements")
      .update({ statut: "paye", date_paiement: new Date().toISOString() })
      .eq("id", paiement.id);
  }
  await recalculerEtatPaiement(paiement.adherent_id);
  return true;
}

/**
 * Si le dossier est en 'echec_paiement' mais qu'il ne reste plus AUCUNE échéance
 * en échec, on repasse en 'en_attente' (badge "Engagé X/N" normal) — sauf s'il
 * est déjà soldé ('paye', posé par recalculerEtatPaiement).
 */
export async function nettoyerStatutEchec(adherentId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: a } = await supabase
    .from("adherents")
    .select("statut_paiement")
    .eq("id", adherentId)
    .single();
  if (a?.statut_paiement !== "echec_paiement") return;
  const { count } = await supabase
    .from("paiements")
    .select("id", { count: "exact", head: true })
    .eq("adherent_id", adherentId)
    .eq("statut", "echec");
  if ((count ?? 0) === 0) {
    await supabase
      .from("adherents")
      .update({
        statut_paiement: "en_attente",
        derniere_erreur_stripe: null,
        derniere_erreur_code: null,
      })
      .eq("id", adherentId);
  }
}

/**
 * Post-succès d'une RÉGULARISATION self-service :
 * 1) remplace la carte par défaut du client (échéances futures sur la nouvelle carte),
 * 2) marque l'échéance liée payée (+ recalcul),
 * 3) sort le dossier de 'echec_paiement' s'il ne reste plus d'échec.
 * Idempotent (appelé par /confirm ET par le webhook).
 */
export async function appliquerRegularisation(
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const adherentId = pi.metadata?.adherentId;
  if (!adherentId) return;
  const supabase = getSupabaseAdmin();

  const pm = typeof pi.payment_method === "string" ? pi.payment_method : null;
  const customer = typeof pi.customer === "string" ? pi.customer : null;
  if (customer && pm) {
    try {
      await getStripe().customers.update(customer, {
        invoice_settings: { default_payment_method: pm },
      });
      await supabase
        .from("adherents")
        .update({ stripe_customer_id: customer })
        .eq("id", adherentId);
    } catch (e) {
      console.error("Régul: maj carte par défaut:", e);
    }
  }

  await marquerEcheancePayee(pi.id);
  await nettoyerStatutEchec(adherentId);
}

// Extrait un id depuis un champ Stripe qui peut être une string ou un objet.
function stripeId(v: string | { id?: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id ?? null;
}

/**
 * Reflet d'un remboursement Stripe (fait dans le dashboard ou via l'API).
 * Idempotent : on FIXE le montant remboursé de l'échéance (= amount_refunded du
 * charge) puis on recalcule le cumul du dossier. Aucun mouvement d'argent ici.
 */
export async function appliquerRemboursement(
  charge: Stripe.Charge,
): Promise<void> {
  const pi = stripeId(charge.payment_intent);
  if (!pi) return;
  const supabase = getSupabaseAdmin();

  const { data: paiement } = await supabase
    .from("paiements")
    .select("id, adherent_id, statut")
    .eq("stripe_payment_intent_id", pi)
    .maybeSingle();
  if (!paiement) return; // charge non rattachée à une échéance connue

  const refundedThis = Math.round(Number(charge.amount_refunded ?? 0)) / 100;
  const fully = charge.refunded === true;
  await supabase
    .from("paiements")
    .update({
      montant_rembourse: refundedThis,
      // Remboursée à 100 % → 'rembourse'. Partiel → on garde le statut existant.
      ...(fully ? { statut: "rembourse" } : {}),
    })
    .eq("id", paiement.id);

  // Cumul dossier (recalcul = idempotent même si l'event est rejoué).
  const { data: lignes } = await supabase
    .from("paiements")
    .select("montant_rembourse")
    .eq("adherent_id", paiement.adherent_id);
  const total =
    Math.round(
      (lignes ?? []).reduce((s, r) => s + Number(r.montant_rembourse || 0), 0) *
        100,
    ) / 100;

  await supabase
    .from("adherents")
    .update({
      montant_rembourse: total,
      rembourse_at: total > 0 ? new Date().toISOString() : null,
    })
    .eq("id", paiement.adherent_id);
}

/**
 * Reflet d'un litige (chargeback) Stripe.
 * - 'ouvert' (dispute.created) : flag + on STOPPE les échéances futures (on ne
 *   prélève plus une carte contestée).
 * - 'gagne' / 'perdu' (dispute.closed) : on met à jour l'issue.
 * Idempotent.
 */
export async function appliquerLitige(
  dispute: Stripe.Dispute,
  statut: "ouvert" | "gagne" | "perdu",
): Promise<void> {
  const pi = stripeId(dispute.payment_intent) ?? stripeId(dispute.charge);
  if (!pi) return;
  const supabase = getSupabaseAdmin();

  const { data: paiement } = await supabase
    .from("paiements")
    .select("adherent_id")
    .eq("stripe_payment_intent_id", pi)
    .maybeSingle();
  if (!paiement) return;
  const adherentId = paiement.adherent_id;

  await supabase
    .from("adherents")
    .update({ litige: true, litige_statut: statut })
    .eq("id", adherentId);

  // Litige ouvert → on coupe les prélèvements à venir (sécurité).
  if (statut === "ouvert") {
    await supabase
      .from("paiements")
      .update({ statut: "annule" })
      .eq("adherent_id", adherentId)
      .in("statut", ["en_attente", "en_cours"])
      .not("numero_echeance", "is", null);
    await supabase
      .from("adherents")
      .update({ prochaine_echeance: null })
      .eq("id", adherentId);
  }
}

/**
 * Annule une inscription côté ÉCHÉANCES : passe toutes les échéances non réglées
 * (en_attente / en_cours / echec) en 'annule' → le cron ne les prélève plus, et
 * pose annule_at (une seule fois) + vide prochaine_echeance. Aucun mouvement
 * d'argent. Partagé par /annuler et /gerer-paiement.
 */
export async function annulerEcheances(
  supabase: SupabaseClient,
  adherentId: string,
): Promise<{ annulees: number }> {
  const { data } = await supabase
    .from("paiements")
    .update({ statut: "annule" })
    .eq("adherent_id", adherentId)
    .in("statut", ["en_attente", "en_cours", "echec"])
    .not("numero_echeance", "is", null)
    .select("id");
  await supabase
    .from("adherents")
    .update({ prochaine_echeance: null })
    .eq("id", adherentId);
  // annule_at posé une seule fois (ne pas écraser une annulation antérieure).
  await supabase
    .from("adherents")
    .update({ annule_at: new Date().toISOString() })
    .eq("id", adherentId)
    .is("annule_at", null);
  return { annulees: data?.length ?? 0 };
}

/**
 * Alloue un montant à rembourser (en CENTIMES) sur les échéances payées, de la
 * plus récente à la plus ancienne : dernière remboursée en entier, puis
 * partiellement la précédente, etc. Arithmétique entière (centimes) → pas de
 * dérive flottante. Fonction PURE (testable).
 */
export function allouerRemboursement(
  payees: { id: string; remb: number; numero_echeance: number | null }[],
  cibleCents: number,
): { id: string; part: number }[] {
  const ordered = [...payees].sort(
    (a, b) => (b.numero_echeance ?? 0) - (a.numero_echeance ?? 0),
  );
  const out: { id: string; part: number }[] = [];
  let reste = Math.max(0, Math.round(cibleCents));
  for (const e of ordered) {
    if (reste <= 0) break;
    const cap = Math.round(Number(e.remb) * 100);
    const part = Math.min(reste, cap);
    if (part > 0) {
      out.push({ id: e.id, part });
      reste -= part;
    }
  }
  return out;
}

/** Marque l'échéance liée à un PaymentIntent en échec + statut adhérent. */
export async function marquerEcheanceEchec(
  paymentIntentId: string,
  message: string,
  code?: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: paiement } = await supabase
    .from("paiements")
    .select("id, adherent_id, montant, date_prevue, numero_echeance")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!paiement) return;
  await supabase.from("paiements").update({ statut: "echec" }).eq("id", paiement.id);
  await supabase
    .from("adherents")
    .update({
      derniere_erreur_stripe: message,
      derniere_erreur_code: code ?? null,
      statut_paiement: "echec_paiement",
    })
    .eq("id", paiement.adherent_id);

  // Email à l'adhérent, adapté à la famille de l'échec.
  const { data: adh } = await supabase
    .from("adherents")
    .select("prenom, email, nb_echeances")
    .eq("id", paiement.adherent_id)
    .single();
  if (adh?.email) {
    try {
      await sendPaiementEchec({
        prenom: adh.prenom,
        email: adh.email,
        montant: Number(paiement.montant || 0),
        date: paiement.date_prevue,
        numero: paiement.numero_echeance,
        nbEcheances: adh.nb_echeances,
        code: code ?? null,
      });
    } catch (e) {
      console.error("Email échec paiement:", e);
    }
  }
}

/**
 * Prélève une échéance en attente via la carte enregistrée (off_session).
 * Utilisé par le job (cron) et par la relance manuelle admin.
 */
export async function chargerEcheance(
  paiementId: string,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { data: p } = await supabase
    .from("paiements")
    .select("*")
    .eq("id", paiementId)
    .maybeSingle();
  if (!p) return { ok: false, error: "Échéance introuvable." };
  // Garde-fou : déjà payée → on ne reprélève jamais.
  if (p.statut === "paye") return { ok: true, status: "succeeded" };

  const { data: a } = await supabase
    .from("adherents")
    .select("id, stripe_customer_id, prenom, email, nb_echeances")
    .eq("id", p.adherent_id)
    .single();
  if (!a?.stripe_customer_id) {
    return { ok: false, error: "Aucun client Stripe associé." };
  }

  const stripe = getStripe();
  const customer = (await stripe.customers.retrieve(
    a.stripe_customer_id,
  )) as Stripe.Customer;
  const pm = customer.invoice_settings?.default_payment_method as
    | string
    | undefined;
  if (!pm) return { ok: false, error: "Aucune carte enregistrée." };

  // CLAIM atomique : on s'approprie la ligne AVANT tout débit, en passant
  // 'en_attente' (ou un 'en_cours' resté bloqué par un run précédent interrompu)
  // → 'en_cours'. Si une autre exécution l'a déjà prise (ou qu'un PI est déjà
  // rattaché), on n'a rien à faire → pas de double-prélèvement.
  const { data: claimed } = await supabase
    .from("paiements")
    .update({ statut: "en_cours" })
    .eq("id", p.id)
    .in("statut", ["en_attente", "en_cours"])
    .is("stripe_payment_intent_id", null)
    .select("id")
    .maybeSingle();
  if (!claimed) {
    return {
      ok: false,
      error: "Échéance déjà en cours de traitement ou non éligible.",
    };
  }

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: Math.round(Number(p.montant) * 100),
        currency: "eur",
        customer: a.stripe_customer_id,
        payment_method: pm,
        off_session: true,
        confirm: true,
        description: `Échéance ${p.numero_echeance ?? ""}`,
        metadata: {
          adherentId: a.id,
          paiementId: p.id,
          numero: String(p.numero_echeance ?? ""),
        },
      },
      // Idempotence : reprendre CETTE échéance à CETTE date prévue (ex. claim
      // bloqué relancé au run suivant) NE peut PAS redébiter — Stripe renvoie le
      // même PaymentIntent au lieu d'en créer un second.
      { idempotencyKey: `echeance-${p.id}-${p.date_prevue ?? "x"}` },
    );
    await supabase
      .from("paiements")
      .update({
        stripe_payment_intent_id: pi.id,
        // Succès → 'paye'. Sinon on relâche le claim ('en_attente') ; le PI étant
        // désormais rattaché, le cron ne le reprendra pas (anti-double).
        statut: pi.status === "succeeded" ? "paye" : "en_attente",
        ...(pi.status === "succeeded"
          ? { date_paiement: new Date().toISOString() }
          : {}),
      })
      .eq("id", p.id);

    if (pi.status === "succeeded") {
      await marquerEcheancePayee(pi.id);
      return { ok: true, status: "succeeded" };
    }
    return { ok: true, status: pi.status };
  } catch (e) {
    const err = e as {
      message?: string;
      code?: string;
      decline_code?: string;
      raw?: { payment_intent?: { id?: string }; code?: string; decline_code?: string };
    };
    const message = err?.message || "Échec du prélèvement.";
    const code =
      err?.decline_code ||
      err?.raw?.decline_code ||
      err?.code ||
      err?.raw?.code ||
      null;
    const piId = err?.raw?.payment_intent?.id;
    await supabase
      .from("paiements")
      .update({ statut: "echec", ...(piId ? { stripe_payment_intent_id: piId } : {}) })
      .eq("id", p.id);
    await supabase
      .from("adherents")
      .update({
        derniere_erreur_stripe: message,
        derniere_erreur_code: code,
        statut_paiement: "echec_paiement",
      })
      .eq("id", a.id);
    if (a.email) {
      try {
        await sendPaiementEchec({
          prenom: a.prenom,
          email: a.email,
          montant: Number(p.montant || 0),
          date: p.date_prevue,
          numero: p.numero_echeance,
          nbEcheances: a.nb_echeances,
          code,
        });
      } catch (mailErr) {
        console.error("Email échec paiement:", mailErr);
      }
    }
    return { ok: false, error: message };
  }
}
