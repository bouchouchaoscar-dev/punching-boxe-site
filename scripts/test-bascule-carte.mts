// Bascule « espèces en attente » → paiement par carte depuis l'espace adhérent.
// Exécuter : npx tsx scripts/test-bascule-carte.mts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { statutTrombi } from "../lib/paiement";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};
type A = Parameters<typeof statutTrombi>[0];
const base: Record<string, unknown> = {
  statut_paiement: "en_attente", mode_paiement: "especes", nb_echeances: 1,
  echeances_payees: 0, engage_at: null, annule_at: null, paiement_a_verifier: false,
};
const st = (o: Record<string, unknown>) => statutTrombi({ ...base, ...o } as A);
// Règle d'affichage du bouton « Payer par carte plutôt » (identique à MonEspace).
const peutPayerCarte = (o: Record<string, unknown>) => {
  const a = { ...base, ...o } as A & { annule_at: string | null };
  return st(o).code === "attente_especes" && !a.annule_at;
};

console.log("\n== Bouton visible UNIQUEMENT si espèces en attente sans encaissement ==");
check("espèces en attente → bouton visible", peutPayerCarte({}) === true);
check("espèces CONFIRMÉES → bouton caché", peutPayerCarte({ statut_paiement: "confirme_especes" }) === false, st({ statut_paiement: "confirme_especes" }));
check("payé carte → bouton caché", peutPayerCarte({ statut_paiement: "paye", mode_paiement: "stripe_1x", echeances_payees: 1 }) === false);
check("fractionné encaissé → bouton caché", peutPayerCarte({ mode_paiement: "stripe_3x", nb_echeances: 3, echeances_payees: 1, engage_at: "2026-09-01" }) === false);
check("annulé → bouton caché (même si espèces en attente)", peutPayerCarte({ annule_at: "2026-09-10" }) === false);

console.log("\n== Statut « à vérifier » (filet double encaissement) ==");
check("paiement_a_verifier → orange « à vérifier »", st({ paiement_a_verifier: true }).code === "a_verifier" && st({ paiement_a_verifier: true }).couleur === "orange");
check("flag ignoré si dossier annulé", st({ paiement_a_verifier: true, annule_at: "2026-09-10" }).code !== "a_verifier");

console.log("\n== Garde-fous statiques ==");
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, "..", p), "utf8");

const finaliser = read("app/api/mon-espace/finaliser/route.ts");
check("finaliser : réutilisé (pas de 2e tunnel) + montant serveur figé", finaliser.includes("Number(adherent.montant_total)") && !/req\.body\.(montant|total)/.test(finaliser));
check("finaliser : détecte la bascule espèces", finaliser.includes("const switchEspeces ="));
check("finaliser : mode NON changé au clic pour la bascule", finaliser.includes('mode_paiement: switchEspeces ? "especes" : mode'));
check("finaliser : ardoise propre (idempotence) — anciennes tentatives supprimées", finaliser.includes('.from("paiements").delete().eq("adherent_id"'));
check("finaliser : échéancier selon la saison (echeancesAutorisees)", finaliser.includes("echeancesAutorisees(now)"));

const payments = read("lib/payments.ts");
const recalc = payments.slice(payments.indexOf("export async function recalculerEtatPaiement"), payments.indexOf("export async function marquerEcheancePayee"));
check("recalcul : bascule seulement à l'engagement réel (devientEngage && especes)", recalc.includes('adherent.mode_paiement === "especes"') && recalc.includes("const bascule ="));
check("recalcul : flip du mode vers stripe_Nx à la confirmation", recalc.includes("const modeCarte = `stripe_${nbCarte}x`") && recalc.includes("bascule ? { mode_paiement: modeCarte }"));
check("recalcul : email club à la bascule (sendAdminBascule)", recalc.includes("sendAdminBascule("));
check("filet double : espèces confirmées + carte → a_verifier (paiement_a_verifier)", recalc.includes('adherent.statut_paiement === "confirme_especes"') && recalc.includes("paiement_a_verifier: true"));
check("filet double : alerte admin + AUCUN remboursement auto", recalc.includes("sendAdminAlertePaiement(") && !recalc.includes("refunds.create") && !recalc.includes("appliquerRemboursement"));
check("filet double : log explicite", recalc.includes("DOUBLE ENCAISSEMENT"));

const confirm = read("app/api/confirm-payment/route.ts");
check("confirm-payment : idempotent (pas de double paiement si échéances déjà créées)", confirm.includes("alreadyProcessed"));

const espace = read("components/espace/MonEspace.tsx");
check("espace : bouton « Payer par carte plutôt »", espace.includes("Payer par carte plutôt"));
check("espace : sous-texte « en une ou plusieurs fois »", espace.includes("Vous pourrez régler en une ou plusieurs fois."));
check("espace : condition attente_especes + non annulé", espace.includes('statutTrombi(a).code === "attente_especes" && !a.annule_at'));

const email = read("lib/email.ts");
check("email club : « finalement réglé par carte »", email.includes("a finalement réglé par carte"));

const migration = read("supabase/migrations/017_paiement_a_verifier.sql");
check("migration 017 : colonne paiement_a_verifier", migration.includes("add column if not exists paiement_a_verifier"));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
