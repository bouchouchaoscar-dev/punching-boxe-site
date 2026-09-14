/**
 * RÉCONCILIATION d'un dossier CARTE COMPTANT (1x) « payé sans encaissement ».
 *
 * Répare un dossier où le PaymentIntent 1x a RÉELLEMENT réussi côté Stripe mais
 * où la ligne d'encaissement (table paiements) n'a jamais été créée — d'où
 * echeances_payees=0 alors que statut_paiement='paye' (bug corrigé pour l'avenir
 * par 735bc3b). S'appuie sur Stripe comme SOURCE DE VÉRITÉ et réutilise les
 * helpers existants (marquerEcheancePayee / recalculerEtatPaiement).
 *
 * LECTURE SEULE côté Stripe. N'écrit RIEN tant que Stripe n'a pas confirmé
 * l'encaissement EXACT du montant du dossier. Idempotent. Ne touche qu'AU
 * dossier ciblé. Exécution PONCTUELLE (pas de cron).
 *
 * Lancer :
 *   npx --yes tsx scripts/reconcilier-paiement-1x.mts                # cible le PI par défaut (Zacharie)
 *   npx --yes tsx scripts/reconcilier-paiement-1x.mts pi_XXX         # par PaymentIntent
 *   npx --yes tsx scripts/reconcilier-paiement-1x.mts <uuid-adherent># par id adhérent
 *
 * Nécessite NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + STRIPE_SECRET_KEY
 * dans .env.local (mêmes clés que les autres scripts .mts du repo).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import type { Adherent } from "../lib/types";

// 1) Charger .env.local AVANT tout accès à l'env ET avant l'import (dynamique)
//    de lib/* — lib/supabase capte les clés au chargement du module.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!SUPA_URL || !SUPA_KEY || !STRIPE_KEY) {
  console.error(
    "Clés manquantes : NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + STRIPE_SECRET_KEY requis dans .env.local.",
  );
  process.exit(1);
}

const supabase = createClient(SUPA_URL, SUPA_KEY);
const stripe = new Stripe(STRIPE_KEY, { timeout: 12000, maxNetworkRetries: 1 });

// Import DYNAMIQUE des helpers (env déjà chargé → getSupabaseAdmin opérationnel).
// On réutilise EXACTEMENT la même garde d'encaissement que le fix 735bc3b et la
// même logique de recalcul (aucune réécriture).
const { marquerEcheancePayee, recalculerEtatPaiement, encaissementComptantValide } =
  await import("../lib/payments");
const { estPaiementSolde, paiementIncoherent } = await import("../lib/paiement");

const DEFAULT_PI = "pi_3UFULRLqAAjvitRy0djJusjy"; // dossier MIRALLES ARRAGON Zacharie
const arg = (process.argv[2] ?? DEFAULT_PI).trim();

const line = "─".repeat(60);
const log = (...a: unknown[]) => console.log(...a);

log(line);
log(" RÉCONCILIATION PAIEMENT 1x — cible :", arg);
log(line);

// 2) Charger l'adhérent (par PaymentIntent OU par id).
const parPI = arg.startsWith("pi_");
const { data: adhData } = parPI
  ? await supabase.from("adherents").select("*").eq("stripe_payment_intent_id", arg).maybeSingle()
  : await supabase.from("adherents").select("*").eq("id", arg).maybeSingle();

if (!adhData) {
  console.error(
    `❌ Dossier introuvable pour ${arg}${parPI ? " (aucun adhérent n'a ce PaymentIntent comme PI courant)" : ""}.`,
  );
  process.exit(1);
}
const a = adhData as Adherent;
const pi = a.stripe_payment_intent_id;

// Snapshot AVANT (adhérent + lignes paiements).
const lignesAvant = (
  await supabase
    .from("paiements")
    .select("id, statut, numero_echeance, stripe_payment_intent_id, montant, date_paiement")
    .eq("adherent_id", a.id)
).data ?? [];

const recap = (titre: string, adh: Adherent, lignes: typeof lignesAvant) => {
  const factureDebloquee = estPaiementSolde(adh) && !paiementIncoherent(adh);
  log(`\n[${titre}]`);
  log(`  ${adh.prenom ?? ""} ${adh.nom ?? ""}  id=${adh.id}`);
  log(`  mode=${adh.mode_paiement}  nb_echeances=${adh.nb_echeances}  echeances_payees=${adh.echeances_payees}`);
  log(`  statut_paiement=${adh.statut_paiement}  montant_total=${adh.montant_total}€`);
  log(`  lignes paiements=${lignes.length}${lignes.length ? " → " + lignes.map((l) => `[${l.statut}${l.numero_echeance != null ? " n°" + l.numero_echeance : ""}]`).join(" ") : ""}`);
  log(`  facture débloquée (soldé & cohérent) : ${factureDebloquee ? "OUI" : "non"}`);
};

recap("AVANT", a, lignesAvant);

// 3) Garde-fous « dossier concerné » : 1x et pas déjà cohérent.
const nb = a.nb_echeances ?? 1;
if (nb > 1) {
  log(`\n⏹️  Pas un dossier comptant (nb_echeances=${nb}) → aucune action.`);
  process.exit(0);
}
if ((a.echeances_payees ?? 0) >= 1) {
  log(`\n✅ Déjà cohérent (echeances_payees=${a.echeances_payees}) → aucune action.`);
  process.exit(0);
}
if (!pi) {
  log(`\n⏹️  Aucun PaymentIntent sur le dossier → impossible de vérifier l'encaissement. Aucune action.`);
  process.exit(0);
}

// 4) Stripe = source de vérité. On EXIGE succeeded + montant exact + PI courant.
//    On expand latest_charge pour récupérer la vraie date d'encaissement.
log(`\n🔎 Vérification Stripe du PaymentIntent ${pi} …`);
const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
const attendu = Math.round(Number(a.montant_total || 0) * 100);
log(`  status=${intent.status}  amount_received=${intent.amount_received ?? 0}  attendu=${attendu}`);

const valide = encaissementComptantValide({
  intentStatus: intent.status,
  amountReceived: intent.amount_received ?? 0,
  montantTotal: Number(a.montant_total || 0),
  piId: pi,
  piCourant: a.stripe_payment_intent_id ?? null,
});
if (!valide) {
  console.error(
    `\n❌ Stripe ne confirme PAS l'encaissement exact (status=${intent.status}, reçu=${intent.amount_received ?? 0}, attendu=${attendu}). AUCUNE écriture.`,
  );
  process.exit(1);
}
log("  ✓ Encaissement Stripe confirmé (montant exact, PI courant).");

// Date d'encaissement réelle (charge) si disponible, sinon maintenant.
const charge =
  intent.latest_charge && typeof intent.latest_charge === "object"
    ? (intent.latest_charge as Stripe.Charge)
    : null;
const datePaiement = charge?.created
  ? new Date(charge.created * 1000).toISOString()
  : new Date().toISOString();
const datePrevue = (a.created_at ?? new Date().toISOString()).slice(0, 10);

// 5) Écriture (idempotente) via les helpers existants.
const ligne = lignesAvant.find((l) => l.stripe_payment_intent_id === pi);

if (ligne && ligne.statut === "paye") {
  // Ligne déjà encaissée : pas d'insert. On relance juste le recalcul de
  // cohérence (echeances_payees / statut) — idempotent.
  log("\nℹ️  Ligne 'paye' déjà présente pour ce PI → pas d'insert. Recalcul de cohérence.");
  await recalculerEtatPaiement(a.id);
} else if (ligne) {
  // Ligne existante non encaissée (ex. 'en_attente') → passage à 'paye' + recalcul.
  log(`\n➡️  Ligne existante en '${ligne.statut}' → passage à 'paye' via marquerEcheancePayee().`);
  const ok = await marquerEcheancePayee(pi);
  if (!ok) {
    console.error("❌ marquerEcheancePayee n'a pas trouvé la ligne (incohérence). Aucune autre écriture.");
    process.exit(1);
  }
} else {
  // Cas Zacharie : AUCUNE ligne → création de la ligne 1x 'paye' puis recalcul.
  log("\n➕ Aucune ligne paiements → création de la ligne 1x 'paye', puis recalcul.");
  const { error: insErr } = await supabase.from("paiements").insert({
    adherent_id: a.id,
    stripe_payment_intent_id: pi,
    montant: Number(a.montant_total || 0),
    montant_rembourse: 0,
    statut: "paye",
    numero_echeance: 1,
    date_prevue: datePrevue,
    date_paiement: datePaiement,
    mail_echec_envoye: false,
    mail_echec_admin_envoye: false,
    rappel_echec_envoye: false,
  });
  if (insErr) {
    console.error("❌ Insert ligne paiements échoué :", insErr.message, "— aucune autre écriture.");
    process.exit(1);
  }
  log(`  ✓ Ligne créée (montant=${a.montant_total}€, payé le ${datePaiement}).`);
  await recalculerEtatPaiement(a.id);
}

// 6) Snapshot APRÈS.
const { data: adhApres } = await supabase.from("adherents").select("*").eq("id", a.id).maybeSingle();
const lignesApres = (
  await supabase
    .from("paiements")
    .select("id, statut, numero_echeance, stripe_payment_intent_id, montant, date_paiement")
    .eq("adherent_id", a.id)
).data ?? [];
recap("APRÈS", (adhApres ?? a) as Adherent, lignesApres);

log(`\n${line}`);
log(" ✅ Réconciliation terminée.");
log(line);
process.exit(0);
