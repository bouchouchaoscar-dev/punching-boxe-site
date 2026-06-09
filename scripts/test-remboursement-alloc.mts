// Test PUR de l'allocation d'un remboursement sur les charges d'un fractionné.
// Lance : npx --yes tsx scripts/test-remboursement-alloc.mts
//
// Règle : on rembourse de la plus RÉCENTE à la plus ANCIENNE (dernière en
// entier, puis partiellement la précédente…). Centimes entiers. Jamais plus que
// le remboursable de chaque charge.

import { allouerRemboursement } from "../lib/payments";

let ok = 0, ko = 0;
function eq(label: string, got: unknown, exp: unknown) {
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) { ok++; console.log(`  ✓ ${label}`); }
  else { ko++; console.log(`  ✗ ${label}\n      obtenu ${g}\n      attendu ${e}`); }
}

// 3× : éch.1=172 (déjà 0 remboursé), éch.2=130, éch.3=130. Tous payés.
const trois = [
  { id: "e1", remb: 172, numero_echeance: 1 },
  { id: "e2", remb: 130, numero_echeance: 2 },
  { id: "e3", remb: 130, numero_echeance: 3 },
];

console.log("Allocation sur 3× (remboursable total 432€) :");
// 200€ → éch.3 pleine (130) + éch.2 partielle (70). éch.1 intacte. LE CAS PIÈGE.
eq("200€ → e3=130 + e2=70", allouerRemboursement(trois, 20000), [
  { id: "e3", part: 13000 },
  { id: "e2", part: 7000 },
]);
// 130€ → uniquement éch.3 (la plus récente), pleine.
eq("130€ → e3=130", allouerRemboursement(trois, 13000), [{ id: "e3", part: 13000 }]);
// 50€ → éch.3 partielle.
eq("50€ → e3=50", allouerRemboursement(trois, 5000), [{ id: "e3", part: 5000 }]);
// 432€ (tout) → e3=130 + e2=130 + e1=172.
eq("432€ → tout", allouerRemboursement(trois, 43200), [
  { id: "e3", part: 13000 },
  { id: "e2", part: 13000 },
  { id: "e1", part: 17200 },
]);
// 0€ → rien.
eq("0€ → []", allouerRemboursement(trois, 0), []);

console.log("\nAvec remboursement partiel déjà présent :");
// éch.3 déjà partiellement remboursée → remboursable réduit (remb=30 au lieu de 130).
const avecDeja = [
  { id: "e2", remb: 130, numero_echeance: 2 },
  { id: "e3", remb: 30, numero_echeance: 3 },
];
// 100€ → e3=30 (son reste) + e2=70.
eq("100€ avec e3 déjà entamée → e3=30 + e2=70", allouerRemboursement(avecDeja, 10000), [
  { id: "e3", part: 3000 },
  { id: "e2", part: 7000 },
]);

console.log("\nCentimes (pas de dérive flottante) :");
const cents = [{ id: "x", remb: 0.1, numero_echeance: 1 }, { id: "y", remb: 0.2, numero_echeance: 2 }];
// 0,30€ → y=20c + x=10c.
eq("0,30€ → y=20 + x=10", allouerRemboursement(cents, 30), [
  { id: "y", part: 20 },
  { id: "x", part: 10 },
]);

console.log(`\n${ok} OK · ${ko} ÉCHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
