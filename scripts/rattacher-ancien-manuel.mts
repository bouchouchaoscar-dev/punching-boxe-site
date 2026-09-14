/**
 * RATTACHEMENT MANUEL d'un dossier natif à une fiche d'ANCIEN, quand le matching
 * automatique a échoué (ex. diminutif « Cathy » ≠ « Catherine » → match_key
 * différent). Filet HUMAIN : Pascal fournit le couple {dossier natif, fiche
 * ancienne} qu'il a identifié à la main.
 *
 * Réutilise la logique d'ancienneté EXISTANTE (doitPayerAdhesion, lib/anciennete)
 * et le recalcul d'adhésion du bouton « reconnaissance » (flip du terme forfaitaire
 * ± TARIFS.adhesion, cf. app/api/admin/adherents/[id]/reconnaissance/route.ts:70-75).
 * Ne réinvente rien, ne duplique aucun -30 en dur.
 *
 * GARDE-FOU ANTI-ERREUR : n'écrit RIEN si les dates de naissance des deux
 * enregistrements diffèrent (preuve d'identité). Idempotent. Ne touche qu'AU
 * dossier ciblé, ni aux documents ni au prénom. Ne modifie pas le matching auto.
 *
 * Lancer :
 *   npx --yes tsx scripts/rattacher-ancien-manuel.mts                       # cas Cathy (défauts)
 *   npx --yes tsx scripts/rattacher-ancien-manuel.mts <dossierId> <ancien>  # <ancien> = UUID ou match_key
 *
 * Nécessite NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans .env.local.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { doitPayerAdhesion } from "../lib/anciennete";
import { TARIFS } from "../lib/pricing";

// Charger .env.local (même bootstrap que reconcilier-paiement-1x.mts).
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error("Clés manquantes : NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis dans .env.local.");
  process.exit(1);
}
const supabase = createClient(SUPA_URL, SUPA_KEY);

// Défauts = le cas ZAÏRE Cathy / Catherine (l'ancien est résolu par match_key
// puisque son UUID n'était pas connu ; passer un UUID en argument le force).
const DEFAULT_DOSSIER = "376f51ab-1c40-4682-a835-eceeade14022";
const DEFAULT_ANCIEN = "zaire|catherine|1966-10-21";
const dossierId = (process.argv[2] ?? DEFAULT_DOSSIER).trim();
const ancienArg = (process.argv[3] ?? DEFAULT_ANCIEN).trim();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bar = "─".repeat(60);
const log = (...a: unknown[]) => console.log(...a);

log(bar);
log(" RATTACHEMENT MANUEL ANCIEN — dossier :", dossierId, "| ancien :", ancienArg);
log(bar);

// 1) Charger le dossier natif.
const { data: dossier } = await supabase
  .from("adherents")
  .select("id, prenom, nom, date_naissance, saison, ancien_id, nouveau_membre, montant_total, match_a_verifier, statut_paiement")
  .eq("id", dossierId)
  .maybeSingle();
if (!dossier) {
  console.error(`❌ Dossier natif introuvable : ${dossierId}`);
  process.exit(1);
}

// 2) Charger la fiche ancienne (par UUID ou par match_key).
const ancienQuery = UUID_RE.test(ancienArg)
  ? supabase.from("anciens_adherents").select("id, prenom, nom, date_naissance, match_key").eq("id", ancienArg)
  : supabase.from("anciens_adherents").select("id, prenom, nom, date_naissance, match_key").eq("match_key", ancienArg);
const { data: anciens } = await ancienQuery;
if (!anciens?.length) {
  console.error(`❌ Fiche ancienne introuvable : ${ancienArg}`);
  process.exit(1);
}
if (anciens.length > 1) {
  console.error(`❌ Ambiguïté : ${anciens.length} fiches anciennes pour ${ancienArg} — fournir l'UUID exact.`);
  process.exit(1);
}
const ancien = anciens[0];

// Récap AVANT + preuve d'identité.
log("\n[AVANT]");
log(`  Dossier natif : ${dossier.prenom} ${dossier.nom}  naissance=${dossier.date_naissance}  saison=${dossier.saison}`);
log(`    ancien_id=${dossier.ancien_id}  nouveau_membre=${dossier.nouveau_membre}  montant_total=${dossier.montant_total}€  match_a_verifier=${dossier.match_a_verifier}`);
log(`  Fiche ancienne : ${ancien.prenom} ${ancien.nom}  naissance=${ancien.date_naissance}  id=${ancien.id}  match_key=${ancien.match_key}`);

// GARDE-FOU : dates de naissance IDENTIQUES (sinon on ne touche à rien).
if (!dossier.date_naissance || !ancien.date_naissance || dossier.date_naissance !== ancien.date_naissance) {
  console.error(
    `\n❌ Dates de naissance DIFFÉRENTES (dossier=${dossier.date_naissance} ≠ ancien=${ancien.date_naissance}). AUCUNE écriture.`,
  );
  process.exit(1);
}
log(`  ✓ Même date de naissance (${dossier.date_naissance}) → identité confirmée.`);

// 3) Idempotence : déjà rattaché ?
if (dossier.ancien_id) {
  log(`\n✅ Déjà rattaché (ancien_id=${dossier.ancien_id}) → aucune écriture.`);
  process.exit(0);
}

// 4) Historique de l'ancien → dernière saison active → règle d'adhésion EXISTANTE.
const { data: hist } = await supabase
  .from("historique_saisons")
  .select("saison")
  .eq("ancien_id", ancien.id);
const saisons = (hist ?? []).map((h) => h.saison as string).filter(Boolean);
const derniereSaisonActive = saisons.length ? saisons.slice().sort().reverse()[0] : null;
const paieAdhesion = doitPayerAdhesion(derniereSaisonActive, dossier.saison as string);
const nouveauMembre = paieAdhesion; // exonérée (ancienne récente) → false

log(`\n🔎 Historique ancien : ${saisons.length} saison(s)${saisons.length ? " → dernière active=" + derniereSaisonActive : ""}`);
log(`  Règle d'adhésion (doitPayerAdhesion, saison inscription=${dossier.saison}) → paieAdhesion=${paieAdhesion} → nouveau_membre=${nouveauMembre}`);

// 5) Recalcul montant_total : flip du terme forfaitaire d'adhésion (± TARIFS.adhesion),
//    strictement la formule du bouton reconnaissance (pas de -30 en dur).
const adhesionAvant = dossier.nouveau_membre ? TARIFS.adhesion : 0;
const adhesionApres = nouveauMembre ? TARIFS.adhesion : 0;
const montantTotal =
  Math.round((Number(dossier.montant_total || 0) - adhesionAvant + adhesionApres) * 100) / 100;
if (montantTotal < 0) {
  console.error("❌ Recalcul montant invalide (négatif). AUCUNE écriture.");
  process.exit(1);
}

// 6) Écriture CIBLÉE (dossier natif uniquement). On ne touche NI documents NI prénom.
const { error: upErr } = await supabase
  .from("adherents")
  .update({
    ancien_id: ancien.id,
    match_a_verifier: false,
    nouveau_membre: nouveauMembre,
    montant_total: montantTotal,
  })
  .eq("id", dossierId);
if (upErr) {
  console.error("❌ Mise à jour échouée :", upErr.message, "— aucune autre écriture.");
  process.exit(1);
}

// Récap APRÈS (relecture).
const { data: apres } = await supabase
  .from("adherents")
  .select("prenom, nom, ancien_id, nouveau_membre, montant_total, match_a_verifier")
  .eq("id", dossierId)
  .maybeSingle();
log("\n[APRÈS]");
log(`  ${apres?.prenom} ${apres?.nom}`);
log(`    ancien_id=${apres?.ancien_id}  nouveau_membre=${apres?.nouveau_membre}  montant_total=${apres?.montant_total}€  match_a_verifier=${apres?.match_a_verifier}`);

log(`\n${bar}`);
log(" ✅ Rattachement terminé.");
log(bar);
process.exit(0);
