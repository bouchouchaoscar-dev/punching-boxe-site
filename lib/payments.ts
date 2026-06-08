import type Stripe from "stripe";
import { getSupabaseAdmin } from "./supabase";
import { getStripe } from "./stripe";
import {
  sendAdherentConfirmation,
  sendAdminNotification,
  sendPaiementEchec,
} from "./email";
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
    .select("prenom, email")
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

  const { data: a } = await supabase
    .from("adherents")
    .select("id, stripe_customer_id, prenom, email")
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

  try {
    const pi = await stripe.paymentIntents.create({
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
    });
    await supabase
      .from("paiements")
      .update({
        stripe_payment_intent_id: pi.id,
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
          code,
        });
      } catch (mailErr) {
        console.error("Email échec paiement:", mailErr);
      }
    }
    return { ok: false, error: message };
  }
}
