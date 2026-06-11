// Test PUR du calcul de tarif (cœur financier). Aucune dépendance réseau.
// Lance : npx --yes tsx scripts/test-pricing.mts
//
// Modèle (depuis lib/pricing.ts) : la cotisation ET l'option prépa sont LUES
// dans des TABLES DE PALIERS selon le mois d'inscription (plus de prorata ÷10).
//   cotisation(mois)   = COTISATION_PALIERS[mois][formule][type]
//   prepa(mois)        = PREPA_PALIERS[mois]   (Boxe Française uniquement)
//   remiseMontant      = round(cotisation(mois) * remisePct/100)   (3e -10%, 4e -15%, 5e+ -20%)
//   cotisationNette    = cotisation(mois) - remiseMontant
//   total              = cotisationNette + adhesion(30 si nouveau) + prepa(mois si BF & option)
// Fractionnement (tarifs.ts) : cotisationNette + prépa ÉTALÉES ensemble ;
//   adhésion (30) payée EN ENTIER sur le 1er prélèvement (jamais fractionnée).

import {
  calculerTarif,
  deduireType,
  remiseFamillePct,
  moisPalier,
  prepaDuMois,
  COTISATION_PALIERS,
  PREPA_PALIERS,
  type PricingInput,
  type TypeAdherent,
  type PackageType,
} from "../lib/pricing";
import { devisPourAdherent, planEcheances, echeancesAutorisees } from "../lib/tarifs";

let ok = 0;
let ko = 0;
function eq(label: string, got: number, exp: number) {
  if (got === exp) { ok++; console.log(`  ✓ ${label} = ${got}`); }
  else { ko++; console.log(`  ✗ ${label} : obtenu ${got}, attendu ${exp}`); }
}
function eqStr(label: string, got: string, exp: string) {
  if (got === exp) { ok++; console.log(`  ✓ ${label} = ${got}`); }
  else { ko++; console.log(`  ✗ ${label} : obtenu ${got}, attendu ${exp}`); }
}
function ok1(label: string, cond: boolean) {
  if (cond) { ok++; console.log(`  ✓ ${label}`); }
  else { ko++; console.log(`  ✗ ${label}`); }
}

// Dates de référence (mois JS : sept=8 … juin=5).
const SEPT = new Date(2026, 8, 15);
const OCT = new Date(2026, 9, 15);
const DEC = new Date(2026, 11, 15);
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
  p: { type: TypeAdherent; pkg: PackageType; nouveau?: boolean; prepa?: boolean; nbFamille?: number },
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
  if (exp.cotisationProratisee !== undefined) eq("cotisation(mois)", r.cotisationProratisee, exp.cotisationProratisee);
  if (exp.remiseMontant !== undefined) eq("remiseMontant", r.remiseMontant, exp.remiseMontant);
  if (exp.cotisationNette !== undefined) eq("cotisationNette", r.cotisationNette, exp.cotisationNette);
  if (exp.adhesion !== undefined) eq("adhesion", r.adhesion, exp.adhesion);
  if (exp.prepa !== undefined) eq("prepa", r.prepa, exp.prepa);
}

console.log("============================================================");
console.log("1) FORMULES DE BASE (sept, plein tarif, sans adhésion/remise)");
console.log("============================================================");
// Sept : BF adulte 430 / jeune 410 ; Savate adulte 350 / jeune 330.
cas("BF adulte", { type: "adulte", pkg: "boxe_classique" }, SEPT, false, { total: 430 });
cas("BF jeune", { type: "jeune", pkg: "boxe_classique" }, SEPT, false, { total: 410 });
cas("Savate adulte", { type: "adulte", pkg: "savate_prepa" }, SEPT, false, { total: 350 });
cas("Savate jeune", { type: "jeune", pkg: "savate_prepa" }, SEPT, false, { total: 330 });
// Option prépa (sept = 70) UNIQUEMENT sur BF.
cas("BF adulte + prépa (sept 70)", { type: "adulte", pkg: "boxe_classique", prepa: true }, SEPT, false, { total: 500, prepa: 70 });
// Savate + option prépa cochée → ignorée (incluse) = 350.
cas("Savate adulte + option prépa (ignorée)", { type: "adulte", pkg: "savate_prepa", prepa: true }, SEPT, false, { total: 350, prepa: 0 });

console.log("\n============================================================");
console.log("2) ADHÉSION 30€ (fixe, hors dégressivité)");
console.log("============================================================");
cas("BF adulte nouveau (+30)", { type: "adulte", pkg: "boxe_classique", nouveau: true }, SEPT, false, { total: 460, adhesion: 30 });
cas("BF adulte ancien (pas d'adhésion)", { type: "adulte", pkg: "boxe_classique", nouveau: false }, SEPT, false, { total: 430, adhesion: 0 });
// Adhésion FIXE sous palier : mai cotisation 100 ; +30 = 130.
cas("Adhésion fixe sous palier (mai)", { type: "adulte", pkg: "boxe_classique", nouveau: true }, MAI, false, { total: 130, cotisationProratisee: 100, adhesion: 30 });
// Adhésion NON remisée : 3e membre (-10%) → nette 387 ; +30 = 417.
cas("Adhésion non remisée (3e membre)", { type: "adulte", pkg: "boxe_classique", nouveau: true, nbFamille: 2 }, SEPT, false, { total: 417, cotisationProratisee: 430, remiseMontant: 43, cotisationNette: 387, adhesion: 30 });

console.log("\n============================================================");
console.log("3) PALIERS COTISATION (BF adulte, par mois)");
console.log("============================================================");
cas("Sept (plein)", { type: "adulte", pkg: "boxe_classique" }, SEPT, false, { total: 430, cotisationProratisee: 430 });
cas("Octobre (plein)", { type: "adulte", pkg: "boxe_classique" }, OCT, false, { total: 430, cotisationProratisee: 430 });
cas("Décembre (375)", { type: "adulte", pkg: "boxe_classique" }, DEC, false, { total: 375, cotisationProratisee: 375 });
cas("Janvier (320)", { type: "adulte", pkg: "boxe_classique" }, JAN, false, { total: 320, cotisationProratisee: 320 });
cas("Février (265)", { type: "adulte", pkg: "boxe_classique" }, FEV, false, { total: 265, cotisationProratisee: 265 });
cas("Mars (210)", { type: "adulte", pkg: "boxe_classique" }, MARS, false, { total: 210, cotisationProratisee: 210 });
cas("Avril (155)", { type: "adulte", pkg: "boxe_classique" }, AVR, false, { total: 155, cotisationProratisee: 155 });
cas("Mai (100)", { type: "adulte", pkg: "boxe_classique" }, MAI, false, { total: 100, cotisationProratisee: 100 });
cas("Juin saison À VENIR (plein 430)", { type: "adulte", pkg: "boxe_classique" }, JUIN, false, { total: 430, cotisationProratisee: 430 });
cas("Juin saison EN COURS (plancher 50)", { type: "adulte", pkg: "boxe_classique" }, JUIN, true, { total: 50, cotisationProratisee: 50 });

console.log("\n============================================================");
console.log("4) OPTION PRÉPA DÉGRESSIVE (BF + option)");
console.log("============================================================");
// Sept→Fév = 70 ; mars/avr/mai = 35 ; juin = 10. cotisation du mois + prépa du mois.
cas("Prépa déc (70) : cot 375 + 70", { type: "adulte", pkg: "boxe_classique", prepa: true }, DEC, false, { total: 445, cotisationProratisee: 375, prepa: 70 });
cas("Prépa mars (35) : cot 210 + 35", { type: "adulte", pkg: "boxe_classique", prepa: true }, MARS, false, { total: 245, cotisationProratisee: 210, prepa: 35 });
cas("Prépa mai (35) : cot 100 + 35", { type: "adulte", pkg: "boxe_classique", prepa: true }, MAI, false, { total: 135, cotisationProratisee: 100, prepa: 35 });
cas("Prépa juin en cours (10) : cot 50 + 10", { type: "adulte", pkg: "boxe_classique", prepa: true }, JUIN, true, { total: 60, cotisationProratisee: 50, prepa: 10 });

console.log("\n============================================================");
console.log("5) REMISE FAMILLE (sur cotisation du mois)");
console.log("============================================================");
cas("1er membre (0%)", { type: "adulte", pkg: "boxe_classique", nbFamille: 0 }, SEPT, false, { total: 430, remiseMontant: 0 });
cas("2e membre (0%)", { type: "adulte", pkg: "boxe_classique", nbFamille: 1 }, SEPT, false, { total: 430, remiseMontant: 0 });
cas("3e membre (-10%)", { type: "adulte", pkg: "boxe_classique", nbFamille: 2 }, SEPT, false, { total: 387, remiseMontant: 43, cotisationNette: 387 });
cas("4e membre (-15% → 65)", { type: "adulte", pkg: "boxe_classique", nbFamille: 3 }, SEPT, false, { total: 365, remiseMontant: 65, cotisationNette: 365 });
cas("5e membre (-20%)", { type: "adulte", pkg: "boxe_classique", nbFamille: 4 }, SEPT, false, { total: 344, remiseMontant: 86, cotisationNette: 344 });
cas("6e membre (-20% plafond)", { type: "adulte", pkg: "boxe_classique", nbFamille: 5 }, SEPT, false, { total: 344, remiseMontant: 86 });
// Palier PUIS remise + adhésion (mai, 3e, nouveau) : cot 100 ; remise 10 ; nette 90 ; +30 = 120.
cas("Palier→remise + adhésion (mai, 3e, nouveau)", { type: "adulte", pkg: "boxe_classique", nouveau: true, nbFamille: 2 }, MAI, false, { total: 120, cotisationProratisee: 100, remiseMontant: 10, cotisationNette: 90, adhesion: 30 });

console.log("\n============================================================");
console.log("6) CAS COMBINÉS RÉELS (famille)");
console.log("============================================================");
const A = calculerTarif({ typeAdherent: "adulte", packageType: "boxe_classique", nouveauMembre: true, optionPrepaPhysique: false, nbMembresFamille: 0 }, SEPT, false);
eq("Famille A — BF adulte sept nouveau", A.total, 460);
const B = calculerTarif({ typeAdherent: "jeune", packageType: "savate_prepa", nouveauMembre: true, optionPrepaPhysique: false, nbMembresFamille: 1 }, SEPT, false);
eq("Famille B — Savate jeune sept nouveau", B.total, 360);
// C (3e) BF jeune janv +prépa nouveau : cot 300 ; -10% 30 ; nette 270 ; +prépa 70 ; +30 = 370.
const C = calculerTarif({ typeAdherent: "jeune", packageType: "boxe_classique", nouveauMembre: true, optionPrepaPhysique: true, nbMembresFamille: 2 }, JAN, false);
eq("Famille C — BF jeune janv +prépa nouveau", C.total, 370);
eq("Famille C — cotisationNette", C.cotisationNette, 270);
eq("Famille C — prepa (janv = 70)", C.prepa, 70);
// D (4e) Savate adulte mai ancien : cot 80 ; -15% round(12)=12 ; nette 68 ; total 68.
const D = calculerTarif({ typeAdherent: "adulte", packageType: "savate_prepa", nouveauMembre: false, optionPrepaPhysique: false, nbMembresFamille: 3 }, MAI, false);
eq("Famille D — Savate adulte mai ancien", D.total, 68);
eq("Famille D — total foyer (A+B+C+D)", A.total + B.total + C.total + D.total, 1258);
// Savate jeune mars 3e nouveau : cot 160 ; -10% 16 ; nette 144 ; +30 = 174.
cas("Savate jeune mars 3e famille nouveau", { type: "jeune", pkg: "savate_prepa", nouveau: true, nbFamille: 2 }, MARS, false, { total: 174, cotisationProratisee: 160, remiseMontant: 16, cotisationNette: 144, adhesion: 30 });

console.log("\n============================================================");
console.log("7) FRACTIONNEMENT (cotisation + prépa ensemble, adhésion à part)");
console.log("============================================================");
// BF adulte mars +prépa nouveau : cot 210 + prépa 35 = 245 fractionnable ; adhésion 30 à part.
const dv = devisPourAdherent({ date_naissance: "1990-01-01", package: "boxe_classique", nouveau_membre: true, option_prepa_physique: true, nb_membres_famille: 0 }, MARS, false);
eq("devis cotisation (mars)", dv.cotisation, 210);
eq("devis prépa (mars 35)", dv.prepa, 35);
eq("devis adhésion", dv.adhesion, 30);
eq("devis fractionnable = cotisation + prépa (245)", dv.fractionnable, 245);
eq("devis total = 245 + 30", dv.total, 275);
ok1("mars → 2x autorisé", echeancesAutorisees(MARS, false).includes(2));
const pe = planEcheances(dv.fractionnable, dv.adhesion, MARS, 2);
eq("plan échéances : somme des montants = fractionnable (adhésion EXCLUE)", Math.round((pe.montants[0] + pe.montants[1]) * 100) / 100, 245);
eq("plan : adhésion à part", pe.adhesion, 30);
eq("plan : 1er prélèvement = mensualité + adhésion", pe.premierPrelevement, 152.5);
ok1("adhésion NON incluse dans les mensualités", pe.montants[0] < dv.total);

console.log("\n============================================================");
console.log("8) HELPERS (deduireType, remise, moisPalier, prépa, tables)");
console.log("============================================================");
eqStr("deduireType 2012-12-31", deduireType("2012-12-31"), "adulte");
eqStr("deduireType 2013-01-01 (borne)", deduireType("2013-01-01"), "adulte");
eqStr("deduireType 2013-01-02", deduireType("2013-01-02"), "jeune");
eqStr("deduireType undefined", deduireType(undefined), "adulte");
eq("remise nb0", remiseFamillePct(0), 0);
eq("remise nb1", remiseFamillePct(1), 0);
eq("remise nb2 (3e)", remiseFamillePct(2), 10);
eq("remise nb3 (4e)", remiseFamillePct(3), 15);
eq("remise nb4 (5e)", remiseFamillePct(4), 20);
eq("remise nb5 (6e)", remiseFamillePct(5), 20);
// moisPalier.
eqStr("moisPalier sept", moisPalier(SEPT, false), "sept");
eqStr("moisPalier déc", moisPalier(DEC, false), "dec");
eqStr("moisPalier janv", moisPalier(JAN, false), "jan");
eqStr("moisPalier mai", moisPalier(MAI, false), "mai");
eqStr("moisPalier juin à venir", moisPalier(JUIN, false), "sept");
eqStr("moisPalier juin en cours", moisPalier(JUIN, true), "juin");
// prepaDuMois.
eq("prépa sept", prepaDuMois(SEPT, false), 70);
eq("prépa févr", prepaDuMois(FEV, false), 70);
eq("prépa mars", prepaDuMois(MARS, false), 35);
eq("prépa mai", prepaDuMois(MAI, false), 35);
eq("prépa juin en cours", prepaDuMois(JUIN, true), 10);
// Tables (échantillons).
eq("table cotisation déc BF adulte", COTISATION_PALIERS.dec.boxe_classique.adulte, 375);
eq("table cotisation mai Savate jeune", COTISATION_PALIERS.mai.savate_prepa.jeune, 75);
eq("table cotisation juin BF jeune (plancher)", COTISATION_PALIERS.juin.boxe_classique.jeune, 50);
eq("table prépa juin", PREPA_PALIERS.juin, 10);

console.log("\n============================================================");
console.log(`RÉSULTAT : ${ok} OK · ${ko} ÉCHEC(S)`);
console.log("============================================================");
process.exit(ko === 0 ? 0 : 1);
