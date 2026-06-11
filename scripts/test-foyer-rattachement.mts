// Test du décompte foyer + résolution/fusion (chantier rattachement famille).
// Lancer : npx --yes tsx scripts/test-foyer-rattachement.mts
//
// Couvre : compteDansFoyer (exclusion fermés, exclusion paniers abandonnés,
// INCLUSION espèces en attente, inclusion engagés), compterFoyer (union), rang,
// resoudreFoyerCible (création, réutilisation, merge, introuvable, ambigu).

import {
  compteDansFoyer,
  compterFoyer,
  rangNouveau,
  resoudreFoyerCible,
  type DossierFoyer,
  type FoyerSource,
} from "../lib/foyer";

let echecs = 0;
function check(nom: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${nom}`);
  else {
    echecs++;
    console.log(`  ✗ ${nom}`, detail ?? "");
  }
}

// Fabrique un dossier minimal.
function d(p: Partial<DossierFoyer>): DossierFoyer {
  return {
    statut_paiement: "en_attente",
    echeances_payees: 0,
    mode_paiement: "stripe_1x",
    annule_at: null,
    ...p,
  } as DossierFoyer;
}

console.log("1) compteDansFoyer (le critère clé)");
check(
  "carte payée → compte",
  compteDansFoyer(d({ statut_paiement: "paye", echeances_payees: 1, mode_paiement: "stripe_1x" })),
);
check(
  "espèces confirmées → compte",
  compteDansFoyer(d({ statut_paiement: "confirme_especes", mode_paiement: "especes" })),
);
check(
  "fractionné engagé (1re échéance) → compte",
  compteDansFoyer(d({ statut_paiement: "en_attente", echeances_payees: 1, mode_paiement: "stripe_3x" })),
);
check(
  "ESPÈCES en attente (finalisé) → COMPTE",
  compteDansFoyer(d({ statut_paiement: "en_attente", echeances_payees: 0, mode_paiement: "especes" })),
);
check(
  "panier abandonné (carte en_attente, non engagé) → NE COMPTE PAS",
  !compteDansFoyer(d({ statut_paiement: "en_attente", echeances_payees: 0, mode_paiement: "stripe_2x" })),
);
check(
  "fermé (annule_at) même payé → NE COMPTE PAS",
  !compteDansFoyer(d({ statut_paiement: "paye", echeances_payees: 1, mode_paiement: "stripe_1x", annule_at: "2026-06-01T10:00:00Z" })),
);
check(
  "fermé même espèces en attente → NE COMPTE PAS",
  !compteDansFoyer(d({ statut_paiement: "en_attente", mode_paiement: "especes", annule_at: "2026-06-01T10:00:00Z" })),
);

console.log("\n2) compterFoyer + rangNouveau (union mixte)");
const foyerMixte = [
  d({ statut_paiement: "paye", echeances_payees: 1 }), // compte
  d({ statut_paiement: "confirme_especes", mode_paiement: "especes" }), // compte
  d({ statut_paiement: "en_attente", mode_paiement: "especes" }), // compte (espèces attente)
  d({ statut_paiement: "en_attente", mode_paiement: "stripe_2x" }), // abandonné → exclu
  d({ statut_paiement: "paye", echeances_payees: 1, annule_at: "2026-01-01" }), // fermé → exclu
];
check("compterFoyer = 3 (2 exclus)", compterFoyer(foyerMixte) === 3, compterFoyer(foyerMixte));
check("rangNouveau = 4 (le nouveau serait le 4e)", rangNouveau(foyerMixte) === 4, rangNouveau(foyerMixte));

console.log("\n3) resoudreFoyerCible — création / réutilisation / merge");
// Aucun foyer existant : on crée NEW, on tague les 2 titulaires.
const r1 = resoudreFoyerCible(
  { titulaireId: "T1", foyerId: null },
  [{ etat: "ok", foyerId: null, titulaireId: "T2" }],
  "NEW",
);
check(
  "création : cible=NEW, titulaires T1+T2 taggés, aucun foyer réécrit",
  r1.ok && r1.cible === "NEW" && r1.foyersAReecrire.length === 0 &&
    r1.titulairesAtagger.join(",") === "T1,T2",
  r1,
);

// Un membre a déjà un foyer F1 : on le réutilise, on tague T1.
const r2 = resoudreFoyerCible(
  { titulaireId: "T1", foyerId: null },
  [{ etat: "ok", foyerId: "F1", titulaireId: "T2" }],
  "NEW",
);
check(
  "réutilisation : cible=F1, T1 taggé",
  r2.ok && r2.cible === "F1" && r2.titulairesAtagger.join(",") === "T1" &&
    r2.foyersAReecrire.length === 0,
  r2,
);

// Deux foyers réels (proprio F2 + membre F1) : merge vers le plus petit (F1).
const r3 = resoudreFoyerCible(
  { titulaireId: "T1", foyerId: "F2" },
  [{ etat: "ok", foyerId: "F1", titulaireId: "T2" }],
  "NEW",
);
check(
  "merge : cible=F1, F2 réécrit vers F1, aucun titulaire à tagger",
  r3.ok && r3.cible === "F1" && r3.foyersAReecrire.join(",") === "F2" &&
    r3.titulairesAtagger.length === 0,
  r3,
);

console.log("\n4) resoudreFoyerCible — blocages");
const intro = resoudreFoyerCible(
  { titulaireId: "T1", foyerId: null },
  [{ etat: "introuvable" } as FoyerSource],
  "NEW",
);
check("introuvable → ok=false raison=introuvable", !intro.ok && intro.raison === "introuvable", intro);

const amb = resoudreFoyerCible(
  { titulaireId: "T1", foyerId: null },
  [{ etat: "ok", foyerId: "F1", titulaireId: "T2" }, { etat: "ambigu" } as FoyerSource],
  "NEW",
);
check("ambigu → ok=false raison=ambigu (jamais de lien auto)", !amb.ok && amb.raison === "ambigu", amb);

console.log(`\nRésultat : ${echecs === 0 ? "TOUS OK" : echecs + " ÉCHEC(S)"}`);
process.exit(echecs === 0 ? 0 : 1);
