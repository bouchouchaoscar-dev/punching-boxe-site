// Service SERVEUR du changement de formule. RÉUTILISE : moteur de tarif, table
// paiements (supplément = ligne numero_echeance null), re-signature existante
// (fiche_a_resigner + lien HMAC), recalculerEtatPaiement (seul écrivain de
// supplement_statut), emails. Aucun second tunnel de paiement ni second système
// de signature.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "./stripe";
import { estMineur, formuleCle, type FormuleCle, type PackageType } from "./pricing";
import { cleVersDossier, labelFormuleCle, type ModeChangement } from "./changement-formule";
import { recalculerSupplement } from "./payments";
import { buildResignatureUrl } from "./resignature-link";
import {
  sendChangementFormuleAdherent,
  sendChangementFormuleAdmin,
} from "./email";
import type { Adherent } from "./types";

const auj = () => new Date().toISOString().slice(0, 10);
const cle = (a: Pick<Adherent, "package" | "option_prepa_physique">) =>
  formuleCle(a.package as PackageType, a.option_prepa_physique ?? false);

/**
 * Déclenche la re-signature de la fiche (mécanisme EXISTANT) : pose UNIQUEMENT
 * fiche_a_resigner. Le mail de re-signature STANDARD n'est PAS envoyé ici : c'est
 * le mail « Votre formule a été mise à jour » (sendChangementFormuleAdherent, avec
 * le lien de signature) qui part — un seul mail par changement. La fiche sera
 * régénérée depuis la formule COURANTE à la signature (backup inclus). Les relances
 * de signature (section 5) restent inchangées.
 */
export async function declencherResignatureFiche(
  supabase: SupabaseClient,
  adherent: Pick<Adherent, "id" | "prenom" | "email">,
): Promise<void> {
  await supabase.from("adherents").update({ fiche_a_resigner: true }).eq("id", adherent.id);
}

/** Lien de signature (espace adhérent / HMAC) pour les emails. */
export function lienSignatureFiche(adherentId: string): string | null {
  try {
    return buildResignatureUrl(adherentId, ["fiche"]);
  } catch {
    return null;
  }
}

/**
 * Cas b CARTE (adhérent, option B) : crée le PaymentIntent 1x du supplément + la
 * ligne paiements (numero_echeance null) + le changement 'en_attente_paiement'.
 * NE change PAS la formule (activée au webhook via recalculerSupplement).
 */
export async function creerSupplementCarte(
  supabase: SupabaseClient,
  adherent: Adherent,
  p: { nouvelleCle: FormuleCle; montantEuros: number; source: "adherent" | "admin"; createdBy: string; motif?: string | null },
): Promise<{ clientSecret: string | null; paiementId: string; changementId: string }> {
  const stripe = getStripe();
  const customerId =
    adherent.stripe_customer_id ||
    (await stripe.customers.create({ email: adherent.email, name: `${adherent.prenom} ${adherent.nom}`, metadata: { adherentId: adherent.id } })).id;
  const pi = await stripe.paymentIntents.create({
    amount: Math.round(p.montantEuros * 100),
    currency: "eur",
    customer: customerId,
    payment_method_types: ["card"],
    description: `Supplément formule — ${adherent.prenom} ${adherent.nom}`,
    metadata: { adherentId: adherent.id, type: "supplement" },
  });
  const paie = await supabase
    .from("paiements")
    .insert({ adherent_id: adherent.id, stripe_payment_intent_id: pi.id, montant: p.montantEuros, statut: "en_attente", numero_echeance: null, date_prevue: auj() })
    .select("id")
    .single();
  if (paie.error || !paie.data) throw new Error(paie.error?.message || "Insertion supplément impossible.");
  const ch = await supabase
    .from("changements_formule")
    .insert({
      dossier_id: adherent.id,
      ancienne_formule: cle(adherent),
      nouvelle_formule: p.nouvelleCle,
      source: p.source,
      montant_cents: Math.round(p.montantEuros * 100),
      mode_reglement: "carte",
      statut: "en_attente_paiement",
      payment_intent_id: pi.id,
      paiement_id: paie.data.id,
      signature_requise: true,
      created_by: p.createdBy,
      motif: p.motif ?? null,
    })
    .select("id")
    .single();
  if (ch.error || !ch.data) throw new Error(ch.error?.message || "Changement impossible.");
  if (!adherent.stripe_customer_id) {
    await supabase.from("adherents").update({ stripe_customer_id: customerId }).eq("id", adherent.id);
  }
  return { clientSecret: pi.client_secret, paiementId: paie.data.id, changementId: ch.data.id };
}

/**
 * Activation IMMÉDIATE d'un changement de formule (admin : offert/espèces/carte-
 * lien ; adhérent : espèces, ou cas a sans encaissement). Met à jour la formule,
 * crée la ligne supplément (espèces / carte-lien), trace le changement, déclenche
 * la re-signature si demandée, recalcule le cache supplement_statut, envoie les
 * emails. Le total du dossier n'est PAS modifié (le supplément est une ligne
 * paiements à part) — SAUF cas a où l'appelant passe `nouveauTotal`.
 */
export type { ModeChangement };

export async function appliquerChangementActif(
  supabase: SupabaseClient,
  adherent: Adherent,
  p: {
    nouvelleCle: FormuleCle;
    montantEuros: number; // supplément (>0) ; 0 si aucun ; remboursement : magnitude (stockée en négatif)
    modeReglement: ModeChangement;
    source: "adherent" | "admin";
    createdBy: string;
    motif?: string | null;
    signatureRequise: boolean;
    nouveauTotal?: number | null; // cas a : total recalculé (sinon inchangé)
  },
): Promise<{ changementId: string }> {
  const cible = cleVersDossier(p.nouvelleCle);
  await supabase
    .from("adherents")
    .update({
      package: cible.package,
      option_prepa_physique: cible.option_prepa_physique,
      ...(p.nouveauTotal != null ? { montant_total: p.nouveauTotal } : {}),
    })
    .eq("id", adherent.id);

  // Ligne supplément en ESPÈCES (choix de l'adhérent) : « en_attente » jusqu'à
  // confirmation de l'encaissement par l'admin. Le mode carte passe par le choix
  // de l'adhérent (choisirModeSupplement → creerSupplementCarte).
  let paiementId: string | null = null;
  if (p.montantEuros > 0 && p.modeReglement === "especes") {
    const paie = await supabase
      .from("paiements")
      .insert({
        adherent_id: adherent.id,
        montant: p.montantEuros,
        statut: "en_attente",
        numero_echeance: null,
        date_prevue: auj(),
        date_paiement: null,
      })
      .select("id")
      .single();
    if (paie.error || !paie.data) throw new Error(paie.error?.message || "Insertion supplément impossible.");
    paiementId = paie.data.id;
  }

  const ch = await supabase
    .from("changements_formule")
    .insert({
      dossier_id: adherent.id,
      ancienne_formule: cle(adherent),
      nouvelle_formule: p.nouvelleCle,
      source: p.source,
      montant_cents: Math.round((p.modeReglement?.startsWith("remboursement") ? -Math.abs(p.montantEuros) : p.montantEuros) * 100),
      mode_reglement: p.modeReglement,
      statut: "actif",
      paiement_id: paiementId,
      signature_requise: p.signatureRequise,
      created_by: p.createdBy,
      motif: p.motif ?? null,
    })
    .select("id")
    .single();
  if (ch.error || !ch.data) throw new Error(ch.error?.message || "Changement impossible.");

  if (p.signatureRequise) {
    await declencherResignatureFiche(supabase, adherent);
  }
  // SEUL écrivain de supplement_statut (dérivé de la réalité).
  await recalculerSupplement(supabase, adherent.id);

  // Emails (best-effort).
  try {
    if (adherent.email) {
      let modeAdherent: "a_regler" | "especes" | "offert" | "remboursement" | null;
      if (p.modeReglement === "remboursement_carte" || p.modeReglement === "remboursement_hors_ligne") modeAdherent = "remboursement";
      else if (p.modeReglement === "especes") modeAdherent = "especes";
      else modeAdherent = p.modeReglement; // 'a_regler' | 'offert' | null
      await sendChangementFormuleAdherent({
        email: adherent.email,
        prenom: adherent.prenom ?? "",
        mineur: estMineur(adherent.date_naissance),
        ancienneFormule: labelFormuleCle(cle(adherent)),
        nouvelleFormule: labelFormuleCle(p.nouvelleCle),
        montantEuros: p.montantEuros,
        mode: modeAdherent,
        signatureRequise: p.signatureRequise,
        lienSigner: p.signatureRequise ? lienSignatureFiche(adherent.id) : null,
        parAdmin: p.source === "admin",
      });
    }
    await sendChangementFormuleAdmin({
      prenom: adherent.prenom ?? "",
      nom: adherent.nom ?? "",
      adherentId: adherent.id,
      nouvelleFormule: labelFormuleCle(p.nouvelleCle),
      montantEuros: p.montantEuros,
      mode: p.modeReglement,
      source: p.source,
    });
  } catch (e) {
    console.error("[CHANGEMENT FORMULE] emails échoués:", adherent.id, e);
  }
  return { changementId: ch.data.id };
}

// Supplément SÉPARÉ en cours (non encore soldé) par dossier : montant dû, déjà
// encaissé, reste dû + statut ('a_regler' | 'especes_attente' | 'carte_attente').
// Sert à l'espace adhérent (récap + « Régler le supplément ») et au « dû » du
// tableau de bord (qui compte le RESTE). [020] Encaissement possible en plusieurs
// fois : l'encaissé se calcule depuis les lignes paiements. Tolérant (table 018/020
// absente → Map vide / colonnes de base).
export type SupplementDossier = {
  montantEuros: number; // montant dû du supplément
  dejaEncaisse: number; // déjà encaissé (versements espèces + carte réglée)
  reste: number; // reste dû
  statut: "a_regler" | "especes_attente" | "carte_attente";
};
export async function chargerSupplementsParDossier(
  supabase: SupabaseClient,
  dossierIds: string[],
): Promise<Map<string, SupplementDossier>> {
  const out = new Map<string, SupplementDossier>();
  if (!dossierIds.length) return out;
  const { data: chs, error } = await supabase
    .from("changements_formule")
    .select("id, dossier_id, montant_cents, mode_reglement, statut, paiement_id")
    .in("dossier_id", dossierIds)
    .eq("statut", "actif");
  if (error || !chs) return out; // table absente → aucun supplément

  // Lignes paiements « supplément » (numéro null) des dossiers concernés, avec
  // montant + rattachement. Tolérant si la colonne changement_id (020) est absente.
  const full = await supabase
    .from("paiements")
    .select("id, statut, montant, changement_id")
    .in("adherent_id", dossierIds)
    .is("numero_echeance", null);
  const supRows: { id: string; statut: string; montant: number; changement_id: string | null }[] = full.error
    ? (((await supabase.from("paiements").select("id, statut, montant").in("adherent_id", dossierIds).is("numero_echeance", null)).data ?? []) as Record<string, unknown>[]).map(
        (p) => ({ id: p.id as string, statut: p.statut as string, montant: Number(p.montant || 0), changement_id: null }),
      )
    : ((full.data ?? []) as Record<string, unknown>[]).map((p) => ({ id: p.id as string, statut: p.statut as string, montant: Number(p.montant || 0), changement_id: (p.changement_id as string | null) ?? null }));
  const encaisseCents = (chId: string, paiementId: string | null) => {
    let c = 0;
    for (const p of supRows) {
      if (p.statut !== "paye") continue;
      if (p.changement_id === chId || (p.changement_id == null && p.id === paiementId)) c += Math.round(p.montant * 100);
    }
    return c;
  };

  for (const c of chs) {
    const duCents = Number(c.montant_cents || 0);
    if (duCents <= 0) continue;
    const mode = c.mode_reglement as string | null;
    const encCents = encaisseCents(c.id as string, (c.paiement_id as string | null) ?? null);
    if (encCents >= duCents) continue; // soldé
    let statut: SupplementDossier["statut"] | null = null;
    if (mode === "a_regler") statut = "a_regler";
    else if (mode === "especes") statut = "especes_attente";
    else if (mode === "carte") statut = "carte_attente";
    if (!statut) continue; // fusionné (null) / offert → pas un supplément dû
    const reste = Math.round(duCents - encCents) / 100;
    const sup: SupplementDossier = { montantEuros: duCents / 100, dejaEncaisse: encCents / 100, reste, statut };
    // Un seul par dossier (le plus défavorable : a_regler/carte priment l'espèces).
    const prec = out.get(c.dossier_id as string);
    if (!prec || (prec.statut === "especes_attente" && statut !== "especes_attente")) {
      out.set(c.dossier_id as string, sup);
    }
  }
  return out;
}

// L'adhérent CHOISIT le mode de règlement d'un supplément 'a_regler' (créé par
// l'admin « à régler par l'adhérent ») : espèces (en attente) ou carte (PI +
// lien de paiement). Met à jour le changement existant. Idempotent par l'état.
export async function choisirModeSupplement(
  supabase: SupabaseClient,
  adherent: Adherent,
  changement: { id: string; montant_cents: number | null },
  mode: "carte" | "especes",
): Promise<{ clientSecret?: string | null; paiementId: string | null }> {
  const montantEuros = Math.max(0, Number(changement.montant_cents ?? 0)) / 100;
  if (mode === "especes") {
    // [020] Pas de ligne « placeholder » : le supplément reste en attente (orange)
    // tant que l'encaissement réel (un ou plusieurs versements, enregistrés par
    // l'admin via /encaisser-especes) ne couvre pas le montant dû. On fixe juste le mode.
    await supabase.from("changements_formule").update({ mode_reglement: "especes", paiement_id: null }).eq("id", changement.id);
    await recalculerSupplement(supabase, adherent.id);
    return { paiementId: null };
  }
  // Carte : PI + ligne paiements (numero null), rattachés au changement.
  const stripe = getStripe();
  const customerId =
    adherent.stripe_customer_id ||
    (await stripe.customers.create({ email: adherent.email, name: `${adherent.prenom} ${adherent.nom}`, metadata: { adherentId: adherent.id } })).id;
  const pi = await stripe.paymentIntents.create({
    amount: Math.round(montantEuros * 100),
    currency: "eur",
    customer: customerId,
    payment_method_types: ["card"],
    description: `Supplément formule — ${adherent.prenom} ${adherent.nom}`,
    metadata: { adherentId: adherent.id, type: "supplement" },
  });
  const paie = await supabase
    .from("paiements")
    .insert({ adherent_id: adherent.id, stripe_payment_intent_id: pi.id, montant: montantEuros, statut: "en_attente", numero_echeance: null, date_prevue: auj() })
    .select("id")
    .single();
  if (paie.error || !paie.data) throw new Error(paie.error?.message || "Enregistrement impossible.");
  await supabase.from("changements_formule").update({ mode_reglement: "carte", payment_intent_id: pi.id, paiement_id: paie.data.id }).eq("id", changement.id);
  if (!adherent.stripe_customer_id) {
    await supabase.from("adherents").update({ stripe_customer_id: customerId }).eq("id", adherent.id);
  }
  await recalculerSupplement(supabase, adherent.id);
  return { clientSecret: pi.client_secret, paiementId: paie.data.id };
}
