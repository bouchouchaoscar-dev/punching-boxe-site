// Service SERVEUR du changement de formule. RÉUTILISE : moteur de tarif, table
// paiements (supplément = ligne numero_echeance null), re-signature existante
// (fiche_a_resigner + lien HMAC), recalculerEtatPaiement (seul écrivain de
// supplement_statut), emails. Aucun second tunnel de paiement ni second système
// de signature.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "./stripe";
import { estMineur, formuleCle, type FormuleCle, type PackageType } from "./pricing";
import { cleVersDossier, labelFormuleCle } from "./changement-formule";
import { recalculerSupplement } from "./payments";
import { buildResignatureUrl } from "./resignature-link";
import {
  sendDemandeResignature,
  sendChangementFormuleAdherent,
  sendChangementFormuleAdmin,
} from "./email";
import type { Adherent } from "./types";

const auj = () => new Date().toISOString().slice(0, 10);
const cle = (a: Pick<Adherent, "package" | "option_prepa_physique">) =>
  formuleCle(a.package as PackageType, a.option_prepa_physique ?? false);

/**
 * Déclenche la re-signature de la fiche (mécanisme EXISTANT) : pose
 * fiche_a_resigner et envoie le lien HMAC. La fiche sera régénérée depuis la
 * formule COURANTE au moment de la signature (backup de l'ancienne incluse).
 */
export async function declencherResignatureFiche(
  supabase: SupabaseClient,
  adherent: Pick<Adherent, "id" | "prenom" | "email">,
): Promise<void> {
  await supabase.from("adherents").update({ fiche_a_resigner: true }).eq("id", adherent.id);
  try {
    if (adherent.email) {
      const lien = buildResignatureUrl(adherent.id, ["fiche"]);
      await sendDemandeResignature({ prenom: adherent.prenom ?? "", email: adherent.email, docs: ["fiche"], lien });
    }
  } catch (e) {
    console.error("[CHANGEMENT FORMULE] lien re-signature échoué:", adherent.id, e);
  }
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
export async function appliquerChangementActif(
  supabase: SupabaseClient,
  adherent: Adherent,
  p: {
    nouvelleCle: FormuleCle;
    montantEuros: number; // supplément (>0) ; 0 si aucun ; remboursement : magnitude (stockée en négatif)
    modeReglement: "carte" | "especes" | "offert" | "remboursement_carte" | "remboursement_hors_ligne" | null;
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

  // Ligne supplément : espèces (en attente de confirmation admin) OU carte (PI
  // + lien de paiement ; activation immédiate, supplément « à finaliser »).
  let paiementId: string | null = null;
  let paymentIntentId: string | null = null;
  if (p.montantEuros > 0 && p.modeReglement === "especes") {
    const paie = await supabase
      .from("paiements")
      .insert({ adherent_id: adherent.id, montant: p.montantEuros, statut: "en_attente", numero_echeance: null, date_prevue: auj() })
      .select("id")
      .single();
    if (paie.error || !paie.data) throw new Error(paie.error?.message || "Insertion supplément impossible.");
    paiementId = paie.data.id;
  } else if (p.montantEuros > 0 && p.modeReglement === "carte") {
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
    paymentIntentId = pi.id;
    const paie = await supabase
      .from("paiements")
      .insert({ adherent_id: adherent.id, stripe_payment_intent_id: pi.id, montant: p.montantEuros, statut: "en_attente", numero_echeance: null, date_prevue: auj() })
      .select("id")
      .single();
    if (paie.error || !paie.data) throw new Error(paie.error?.message || "Insertion supplément impossible.");
    paiementId = paie.data.id;
    if (!adherent.stripe_customer_id) {
      await supabase.from("adherents").update({ stripe_customer_id: customerId }).eq("id", adherent.id);
    }
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
      payment_intent_id: paymentIntentId,
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
      const modeAdherent = p.modeReglement?.startsWith("remboursement") ? "remboursement" : p.modeReglement;
      await sendChangementFormuleAdherent({
        email: adherent.email,
        prenom: adherent.prenom ?? "",
        mineur: estMineur(adherent.date_naissance),
        ancienneFormule: labelFormuleCle(cle(adherent)),
        nouvelleFormule: labelFormuleCle(p.nouvelleCle),
        montantEuros: p.montantEuros,
        mode: modeAdherent as "carte" | "especes" | "offert" | "remboursement" | null,
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
