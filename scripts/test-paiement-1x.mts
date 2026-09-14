// Test PUR des gardes « argent » du paiement CARTE COMPTANT (1x). Aucune
// dépendance réseau (les prédicats sont purs ; l'I/O Stripe/DB est autour).
// Lance : npx --yes tsx scripts/test-paiement-1x.mts
//
// Prouve le cœur du correctif du bug de prod « payé sans encaissement » :
//   - encaissementComptantValide : ne valide un 1x QUE si Stripe confirme
//     l'encaissement réel (status 'succeeded'), pour le BON montant, et sur le
//     PaymentIntent COURANT du dossier. Un PI non-'succeeded' OU orphelin OU au
//     mauvais montant NE marque PAS payé.
//   - paiementIncoherent : détecte un dossier carte 1x 'paye' sans encaissement
//     reflété (echeances_payees=0) → état ALERTE « à vérifier » (ni vert, ni
//     facture acquittée). Espèces et fractionné exclus.

import { encaissementComptantValide } from "../lib/payments";
import { paiementIncoherent } from "../lib/paiement";

let ok = 0;
let ko = 0;
function ok1(label: string, cond: boolean) {
  if (cond) { ok++; console.log(`  ✓ ${label}`); }
  else { ko++; console.log(`  ✗ ${label}`); }
}

const PI = "pi_courant_123";
const MONTANT = 460; // € → 46000 centimes attendus

console.log("\n=== encaissementComptantValide (garde encaissement 1x) ===");

// ✅ Cas nominal : encaissement réel, bon montant, PI courant → valide.
ok1(
  "succeeded + montant exact + PI courant → VALIDE (marque payé)",
  encaissementComptantValide({
    intentStatus: "succeeded",
    amountReceived: 46000,
    montantTotal: MONTANT,
    piId: PI,
    piCourant: PI,
  }) === true,
);

// ❌ PI NON abouti (le bug ne doit JAMAIS marquer payé sur la confiance).
ok1(
  "status 'requires_payment_method' → NE marque PAS payé",
  encaissementComptantValide({
    intentStatus: "requires_payment_method",
    amountReceived: 0,
    montantTotal: MONTANT,
    piId: PI,
    piCourant: PI,
  }) === false,
);
ok1(
  "status 'processing' → NE marque PAS payé",
  encaissementComptantValide({
    intentStatus: "processing",
    amountReceived: 0,
    montantTotal: MONTANT,
    piId: PI,
    piCourant: PI,
  }) === false,
);

// ❌ PI ORPHELIN : abouti mais ≠ PI courant du dossier (cause racine du désync).
ok1(
  "succeeded mais PI orphelin (≠ PI courant) → NE marque PAS payé",
  encaissementComptantValide({
    intentStatus: "succeeded",
    amountReceived: 46000,
    montantTotal: MONTANT,
    piId: "pi_orphelin_999",
    piCourant: PI,
  }) === false,
);
ok1(
  "succeeded mais aucun PI courant sur le dossier (null) → NE marque PAS payé",
  encaissementComptantValide({
    intentStatus: "succeeded",
    amountReceived: 46000,
    montantTotal: MONTANT,
    piId: PI,
    piCourant: null,
  }) === false,
);

// ❌ Montant reçu ≠ total attendu (sous-paiement / mauvais montant).
ok1(
  "succeeded mais montant reçu ≠ total attendu → NE marque PAS payé",
  encaissementComptantValide({
    intentStatus: "succeeded",
    amountReceived: 30000, // 300€ au lieu de 460€
    montantTotal: MONTANT,
    piId: PI,
    piCourant: PI,
  }) === false,
);

// ❌ Total à 0 : garde anti dossier vide (attendu doit être > 0).
ok1(
  "montant_total = 0 → NE marque PAS payé (même amount_received 0)",
  encaissementComptantValide({
    intentStatus: "succeeded",
    amountReceived: 0,
    montantTotal: 0,
    piId: PI,
    piCourant: PI,
  }) === false,
);

console.log("\n=== paiementIncoherent (vert/facture basés encaissement réel) ===");

// ⚠️ Résidu du bug : carte 1x 'paye' mais rien encaissé → incohérent (orange).
ok1(
  "carte 1x 'paye' + echeances_payees=0 → INCOHÉRENT (à vérifier)",
  paiementIncoherent({
    statut_paiement: "paye",
    mode_paiement: "stripe_1x",
    nb_echeances: 1,
    echeances_payees: 0,
  }) === true,
);

// 🟢 Vrai 1x encaissé (après correctif : echeances_payees=1) → cohérent.
ok1(
  "carte 1x 'paye' + echeances_payees=1 → cohérent (vert légitime)",
  paiementIncoherent({
    statut_paiement: "paye",
    mode_paiement: "stripe_1x",
    nb_echeances: 1,
    echeances_payees: 1,
  }) === false,
);

// 🟢 Espèces confirmées : jamais « incohérent » (garde ciblée carte).
ok1(
  "espèces confirmées → jamais incohérent",
  paiementIncoherent({
    statut_paiement: "confirme_especes",
    mode_paiement: "especes",
    nb_echeances: 1,
    echeances_payees: 0,
  }) === false,
);

// 🟢 Fractionné (nb>1) : exclu (son état vient déjà de echeances_payees).
ok1(
  "fractionné 3x 'paye' + echeances_payees=0 → exclu (non incohérent)",
  paiementIncoherent({
    statut_paiement: "paye",
    mode_paiement: "stripe_3x",
    nb_echeances: 3,
    echeances_payees: 0,
  }) === false,
);

// 🟢 Carte 1x pas encore payée : rien à signaler.
ok1(
  "carte 1x 'en_attente' → non incohérent",
  paiementIncoherent({
    statut_paiement: "en_attente",
    mode_paiement: "stripe_1x",
    nb_echeances: 1,
    echeances_payees: 0,
  }) === false,
);

console.log("\n============================================================");
console.log(`RÉSULTAT : ${ok} OK · ${ko} ÉCHEC(S)`);
console.log("============================================================");
process.exit(ko === 0 ? 0 : 1);
