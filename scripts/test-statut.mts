// statutTrombi — SOURCE UNIQUE du statut/couleur (Présence, trombinoscope, coach).
// Règle : le vert n'est autorisé que si un ENCAISSEMENT RÉEL existe.
// Exécuter : npx tsx scripts/test-statut.mts
import { statutTrombi } from "../lib/paiement";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => { if (c) { ok++; console.log(`  ✓ ${l}`); } else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); } };

type A = Parameters<typeof statutTrombi>[0];
const base: Record<string, unknown> = { statut_paiement: "en_attente", mode_paiement: null, nb_echeances: 1, echeances_payees: 0, engage_at: null, annule_at: null };
const st = (o: Record<string, unknown>) => statutTrombi({ ...base, ...o } as A);

// Dossier sans paiement ni échéance (créé admin, docs OK, paiement jamais fait).
check("aucun paiement/échéance → rouge à finaliser", st({}).couleur === "rouge" && st({}).code === "a_finaliser", st({}));
// Carte choisie sans aucun encaissement.
check("carte choisie, 0 encaissé → rouge à finaliser", st({ mode_paiement: "stripe_3x", nb_echeances: 3 }).couleur === "rouge", st({ mode_paiement: "stripe_3x", nb_echeances: 3 }));
// Fractionné avec 1re échéance encaissée.
check("fractionné 1 échéance encaissée → vert", st({ mode_paiement: "stripe_3x", nb_echeances: 3, echeances_payees: 1, engage_at: "2026-09-01" }).couleur === "vert", st({ mode_paiement: "stripe_3x", nb_echeances: 3, echeances_payees: 1 }));
// Espèces non confirmées.
check("espèces non confirmées → orange en attente", st({ mode_paiement: "especes" }).code === "attente_especes" && st({ mode_paiement: "especes" }).couleur === "orange");
// Payé (fractionné soldé).
check("payé (soldé) → vert", st({ statut_paiement: "paye", mode_paiement: "stripe_2x", nb_echeances: 2, echeances_payees: 2 }).couleur === "vert");
// Espèces confirmées → vert.
check("espèces confirmées → vert", st({ statut_paiement: "confirme_especes", mode_paiement: "especes" }).couleur === "vert");
// Échec → rouge.
check("échec de prélèvement → rouge", st({ statut_paiement: "echec_paiement" }).couleur === "rouge");
// Carte 1x « payé » sans encaissement → orange à vérifier (jamais vert).
check("carte 1x payé, 0 encaissé → orange à vérifier", st({ statut_paiement: "paye", mode_paiement: "stripe_1x", nb_echeances: 1, echeances_payees: 0 }).code === "a_verifier");
// Non-régression : la couleur NE dépend PAS du mode/statut déclaré sans encaissement.
check("mode carte + statut en_attente, 0 encaissé → JAMAIS vert", st({ mode_paiement: "stripe_4x", nb_echeances: 4 }).couleur !== "vert");

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
