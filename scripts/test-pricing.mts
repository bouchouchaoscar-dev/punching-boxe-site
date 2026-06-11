// Test PUR du calcul de tarif (cœur financier). Aucune dépendance réseau.
// Lance : npx --yes tsx scripts/test-pricing.mts
//
// Chaque montant attendu est calculé À LA MAIN en commentaire, d'après la
// logique de lib/pricing.ts :
//   cotisationProratisee = round(base/10 * moisFactures)
//   remiseMontant        = round(cotisationProratisee * remisePct/100)
//   cotisationNette      = cotisationProratisee - remiseMontant
//   total                = cotisationNette + adhesion(30 si nouveau) + prepa(70 si BF & option)
// Prorata → cotisation SEULE. Adhésion (30) et prépa (70) = montants FIXES.
// Remise famille → cotisation proratisée SEULE (jamais sur adhésion/prépa).
// moisFactures : sept-déc/juil/août=10, janv=8, févr=6,5, mars=5, avr=4, mai=3,
//                juin=10 (saison à venir) ou 2 (saison en cours).
// Remise : rang = nbMembresFamille+1 ; rang3=-10%, rang4=-15%, rang≥5=-20%.

import {
  calculerTarif,
  deduireType,
  remiseFamillePct,
  moisFactures,
  type PricingInput,
  type TypeAdherent,
  type PackageType,
} from "../lib/pricing";

let ok = 0;
let ko = 0;
function eq(label: string, got: number, exp: number) {
  if (got === exp) {
    ok++;
    console.log(`  ✓ ${label} = ${got}`);
  } else {
    ko++;
    console.log(`  ✗ ${label} : obtenu ${got}, attendu ${exp}`);
  }
}

// Dates de référence (mois JS : sept=8 … juin=5).
const SEPT = new Date(2026, 8, 15);
const OCT = new Date(2026, 9, 15);
const JAN = new Date(2027, 0, 15);
const FEV = new Date(2027, 1, 15);
const MARS = new Date(2027, 2, 15);
const AVR = new Date(2027, 3, 15);
const MAI = new Date(2027, 4, 15);
const JUIN = new Date(2026, 5, 15);

type Exp = {
  total: number;
  cotisationProratisee?: number;
  remiseMontant?: number;
  cotisationNette?: number;
  adhesion?: number;
  prepa?: number;
};
function cas(
  label: string,
  p: {
    type: TypeAdherent;
    pkg: PackageType;
    nouveau?: boolean;
    prepa?: boolean;
    nbFamille?: number;
  },
  date: Date,
  saisonEnCours: boolean,
  exp: Exp,
) {
  const input: PricingInput = {
    typeAdherent: p.type,
    packageType: p.pkg,
    nouveauMembre: !!p.nouveau,
    optionPrepaPhysique: !!p.prepa,
    nbMembresFamille: p.nbFamille ?? 0,
  };
  const r = calculerTarif(input, date, saisonEnCours);
  console.log(`\n• ${label}`);
  eq("total", r.total, exp.total);
  if (exp.cotisationProratisee !== undefined)
    eq("cotisationProratisee", r.cotisationProratisee, exp.cotisationProratisee);
  if (exp.remiseMontant !== undefined)
    eq("remiseMontant", r.remiseMontant, exp.remiseMontant);
  if (exp.cotisationNette !== undefined)
    eq("cotisationNette", r.cotisationNette, exp.cotisationNette);
  if (exp.adhesion !== undefined) eq("adhesion", r.adhesion, exp.adhesion);
  if (exp.prepa !== undefined) eq("prepa", r.prepa, exp.prepa);
}

console.log("============================================================");
console.log("1) FORMULES DE BASE (sept, plein tarif, sans adhésion/remise)");
console.log("============================================================");
// BF adulte 430 / jeune 410 ; Savate adulte 350 / jeune 330.
cas("BF adulte", { type: "adulte", pkg: "boxe_classique" }, SEPT, false, { total: 430 });
cas("BF jeune", { type: "jeune", pkg: "boxe_classique" }, SEPT, false, { total: 410 });
cas("Savate adulte", { type: "adulte", pkg: "savate_prepa" }, SEPT, false, { total: 350 });
cas("Savate jeune", { type: "jeune", pkg: "savate_prepa" }, SEPT, false, { total: 330 });
// Prépa +70 UNIQUEMENT sur BF.
// BF adulte + prépa = 430 + 70 = 500.
cas("BF adulte + prépa", { type: "adulte", pkg: "boxe_classique", prepa: true }, SEPT, false, {
  total: 500,
  prepa: 70,
});
// Savate adulte + option prépa cochée → prépa NON facturée (incluse) = 350.
cas("Savate adulte + option prépa (doit être ignorée)", { type: "adulte", pkg: "savate_prepa", prepa: true }, SEPT, false, {
  total: 350,
  prepa: 0,
});

console.log("\n============================================================");
console.log("2) ADHÉSION 30€");
console.log("============================================================");
// Nouveau membre : 430 + 30 = 460.
cas("BF adulte nouveau (+30)", { type: "adulte", pkg: "boxe_classique", nouveau: true }, SEPT, false, {
  total: 460,
  adhesion: 30,
});
// Ancien dans la règle : pas d'adhésion = 430.
cas("BF adulte ancien (pas d'adhésion)", { type: "adulte", pkg: "boxe_classique", nouveau: false }, SEPT, false, {
  total: 430,
  adhesion: 0,
});
// Adhésion NON proratisée : mai mf=3 → proratisee round(430/10*3)=129 ; +30 = 159.
cas("Adhésion fixe sous prorata (mai)", { type: "adulte", pkg: "boxe_classique", nouveau: true }, MAI, false, {
  total: 159,
  cotisationProratisee: 129,
  adhesion: 30,
});
// Adhésion NON remisée : 3e membre (-10%) → nette 387 ; +30 = 417 (le 30 n'est pas réduit).
cas("Adhésion non remisée (3e membre)", { type: "adulte", pkg: "boxe_classique", nouveau: true, nbFamille: 2 }, SEPT, false, {
  total: 417,
  cotisationProratisee: 430,
  remiseMontant: 43,
  cotisationNette: 387,
  adhesion: 30,
});

console.log("\n============================================================");
console.log("3) PRORATA (cotisation seule)");
console.log("============================================================");
// BF adulte 430 selon le mois : sept 10→430, janv 8→344, févr 6,5→279,5→280,
// mars 5→215, avr 4→172, mai 3→129, juin (à venir) 10→430, juin (en cours) 2→86, oct 10→430.
cas("Sept plein (mf10)", { type: "adulte", pkg: "boxe_classique" }, SEPT, false, { total: 430, cotisationProratisee: 430 });
cas("Janvier (mf8)", { type: "adulte", pkg: "boxe_classique" }, JAN, false, { total: 344, cotisationProratisee: 344 });
cas("Février (mf6,5 → arrondi 280)", { type: "adulte", pkg: "boxe_classique" }, FEV, false, { total: 280, cotisationProratisee: 280 });
cas("Mars (mf5)", { type: "adulte", pkg: "boxe_classique" }, MARS, false, { total: 215, cotisationProratisee: 215 });
cas("Avril (mf4)", { type: "adulte", pkg: "boxe_classique" }, AVR, false, { total: 172, cotisationProratisee: 172 });
cas("Mai (mf3) — fin de saison", { type: "adulte", pkg: "boxe_classique" }, MAI, false, { total: 129, cotisationProratisee: 129 });
cas("Octobre (mf10)", { type: "adulte", pkg: "boxe_classique" }, OCT, false, { total: 430, cotisationProratisee: 430 });
cas("Juin saison À VENIR (mf10)", { type: "adulte", pkg: "boxe_classique" }, JUIN, false, { total: 430, cotisationProratisee: 430 });
cas("Juin saison EN COURS (mf2)", { type: "adulte", pkg: "boxe_classique" }, JUIN, true, { total: 86, cotisationProratisee: 86 });
// Prépa NON proratisée : mai 129 + prépa 70 = 199 (la prépa reste à 70).
cas("Prépa fixe sous prorata (mai +prépa)", { type: "adulte", pkg: "boxe_classique", prepa: true }, MAI, false, {
  total: 199,
  cotisationProratisee: 129,
  prepa: 70,
});

console.log("\n============================================================");
console.log("4) REMISE FAMILLE (sur cotisation proratisée seule)");
console.log("============================================================");
// rang = nbFamille+1. BF adulte 430, sept plein.
// nb0→0% 430 ; nb1→0% 430 ; nb2→10% (remise43) 387 ; nb3→15% (round(64,5)=65) 365 ;
// nb4→20% (remise86) 344 ; nb5→20% 344.
cas("1er membre (0%)", { type: "adulte", pkg: "boxe_classique", nbFamille: 0 }, SEPT, false, { total: 430, remiseMontant: 0 });
cas("2e membre (0%)", { type: "adulte", pkg: "boxe_classique", nbFamille: 1 }, SEPT, false, { total: 430, remiseMontant: 0 });
cas("3e membre (-10%)", { type: "adulte", pkg: "boxe_classique", nbFamille: 2 }, SEPT, false, { total: 387, remiseMontant: 43, cotisationNette: 387 });
cas("4e membre (-15% → remise 65)", { type: "adulte", pkg: "boxe_classique", nbFamille: 3 }, SEPT, false, { total: 365, remiseMontant: 65, cotisationNette: 365 });
cas("5e membre (-20%)", { type: "adulte", pkg: "boxe_classique", nbFamille: 4 }, SEPT, false, { total: 344, remiseMontant: 86, cotisationNette: 344 });
cas("6e membre (-20% plafond)", { type: "adulte", pkg: "boxe_classique", nbFamille: 5 }, SEPT, false, { total: 344, remiseMontant: 86 });
// Ordre prorata PUIS remise (mai, 3e, nouveau) :
// proratisee round(430/10*3)=129 ; remise round(129*0,1)=13 ; nette 116 ; +30 = 146.
cas("Ordre prorata→remise + adhésion (mai, 3e, nouveau)", { type: "adulte", pkg: "boxe_classique", nouveau: true, nbFamille: 2 }, MAI, false, {
  total: 146,
  cotisationProratisee: 129,
  remiseMontant: 13,
  cotisationNette: 116,
  adhesion: 30,
});

console.log("\n============================================================");
console.log("5) CAS COMBINÉS RÉELS");
console.log("============================================================");
// Famille de 4, formules/moments différents (nbFamille = rang-1 au moment de chaque inscription).
// A (1er) BF adulte sept nouveau : 430 + 30 = 460.
const A = calculerTarif({ typeAdherent: "adulte", packageType: "boxe_classique", nouveauMembre: true, optionPrepaPhysique: false, nbMembresFamille: 0 }, SEPT, false);
eq("Famille A — BF adulte sept nouveau", A.total, 460);
// B (2e) Savate jeune sept nouveau : 330 + 30 = 360 (0% remise).
const B = calculerTarif({ typeAdherent: "jeune", packageType: "savate_prepa", nouveauMembre: true, optionPrepaPhysique: false, nbMembresFamille: 1 }, SEPT, false);
eq("Famille B — Savate jeune sept nouveau", B.total, 360);
// C (3e) BF jeune janv +prépa nouveau :
//   proratisee round(410/10*8)=328 ; remise -10% round(32,8)=33 ; nette 295 ; +prépa 70 ; +30 = 395.
const C = calculerTarif({ typeAdherent: "jeune", packageType: "boxe_classique", nouveauMembre: true, optionPrepaPhysique: true, nbMembresFamille: 2 }, JAN, false);
eq("Famille C — BF jeune janv +prépa nouveau", C.total, 395);
eq("Famille C — cotisationNette", C.cotisationNette, 295);
eq("Famille C — prepa", C.prepa, 70);
// D (4e) Savate adulte mai ancien :
//   proratisee round(350/10*3)=105 ; remise -15% round(15,75)=16 ; nette 89 ; prépa 0 ; adhésion 0 = 89.
const D = calculerTarif({ typeAdherent: "adulte", packageType: "savate_prepa", nouveauMembre: false, optionPrepaPhysique: false, nbMembresFamille: 3 }, MAI, false);
eq("Famille D — Savate adulte mai ancien", D.total, 89);
eq("Famille D — total foyer (A+B+C+D)", A.total + B.total + C.total + D.total, 1304);

// Jeune en Savate, en cours de saison (mars), 3e de sa famille, nouveau :
//   proratisee round(330/10*5)=165 ; remise -10% round(16,5)=17 ; nette 148 ; +30 = 178.
cas("Savate jeune mars 3e famille nouveau", { type: "jeune", pkg: "savate_prepa", nouveau: true, nbFamille: 2 }, MARS, false, {
  total: 178,
  cotisationProratisee: 165,
  remiseMontant: 17,
  cotisationNette: 148,
  adhesion: 30,
});

console.log("\n============================================================");
console.log("6) HELPERS (deduireType, remiseFamillePct, moisFactures)");
console.log("============================================================");
function eqStr(label: string, got: string, exp: string) {
  if (got === exp) { ok++; console.log(`  ✓ ${label} = ${got}`); }
  else { ko++; console.log(`  ✗ ${label} : obtenu ${got}, attendu ${exp}`); }
}
// deduireType : né APRÈS 2013-01-01 → jeune (borne stricte).
eqStr("deduireType 2012-12-31", deduireType("2012-12-31"), "adulte");
eqStr("deduireType 2013-01-01 (borne)", deduireType("2013-01-01"), "adulte");
eqStr("deduireType 2013-01-02", deduireType("2013-01-02"), "jeune");
eqStr("deduireType undefined", deduireType(undefined), "adulte");
// remiseFamillePct : rang = nb+1.
eq("remise nb0", remiseFamillePct(0), 0);
eq("remise nb1", remiseFamillePct(1), 0);
eq("remise nb2 (3e)", remiseFamillePct(2), 10);
eq("remise nb3 (4e)", remiseFamillePct(3), 15);
eq("remise nb4 (5e)", remiseFamillePct(4), 20);
eq("remise nb5 (6e)", remiseFamillePct(5), 20);
// moisFactures.
eq("mf sept", moisFactures(SEPT, false), 10);
eq("mf janv", moisFactures(JAN, false), 8);
eq("mf févr", moisFactures(FEV, false), 6.5);
eq("mf mars", moisFactures(MARS, false), 5);
eq("mf avr", moisFactures(AVR, false), 4);
eq("mf mai", moisFactures(MAI, false), 3);
eq("mf juin (à venir)", moisFactures(JUIN, false), 10);
eq("mf juin (en cours)", moisFactures(JUIN, true), 2);

console.log("\n============================================================");
console.log(`RÉSULTAT : ${ok} OK · ${ko} ÉCHEC(S)`);
console.log("============================================================");
process.exit(ko === 0 ? 0 : 1);
