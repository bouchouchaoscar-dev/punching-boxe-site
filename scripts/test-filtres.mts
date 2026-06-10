// Test des listes intelligentes : croisement type (jeune/adulte) + nouveaux
// segments (fait_prepa, echec_paiement, non_reinscrits).
// npx --yes tsx scripts/test-filtres.mts
import { filtrerAdherents } from "../lib/campagnes";
import { saisonCourante } from "../lib/saison";
import type { Adherent } from "../lib/types";

const courante = saisonCourante(new Date());
const y = parseInt(courante.slice(0, 4), 10);
const precedente = `${y - 1}-${y}`;

function A(id: string, o: Partial<Adherent> = {}): Adherent {
  return {
    id,
    type_adherent: "adulte",
    package: "boxe_classique",
    option_prepa_physique: false,
    statut_paiement: "paye",
    saison: courante,
    annule_at: null,
    email: `${id}@x.fr`,
    match_key: null,
    ...o,
  } as unknown as Adherent;
}
const ids = (xs: Adherent[]) => xs.map((x) => x.id).sort().join(",");
let ko = 0;
function eq(label: string, got: string, exp: string) {
  if (got === exp) console.log("  ✓", label);
  else {
    ko++;
    console.log("  ✗", label, "→", got, "≠", exp);
  }
}

console.log("== Croisement type (transversal) ==");
const base = [
  A("a1", { type_adherent: "adulte", package: "boxe_classique" }),
  A("a2", { type_adherent: "adulte", package: "savate_prepa" }),
  A("j1", { type_adherent: "jeune", package: "boxe_classique" }),
  A("j2", { type_adherent: "jeune", package: "savate_prepa" }),
];
eq("tous + adultes → adultes", ids(filtrerAdherents(base, ["tous", "adultes"])), "a1,a2");
eq("tous + jeunes → jeunes", ids(filtrerAdherents(base, ["tous", "jeunes"])), "j1,j2");
eq("adultes + jeunes → tous", ids(filtrerAdherents(base, ["adultes", "jeunes"])), "a1,a2,j1,j2");
eq("boxe + jeunes", ids(filtrerAdherents(base, ["boxe", "jeunes"])), "j1");

console.log("\n== fait_prepa (savate OU boxe+option) ==");
const prepa = [
  A("s1", { package: "savate_prepa" }),
  A("b1", { package: "boxe_classique", option_prepa_physique: false }),
  A("b2", { package: "boxe_classique", option_prepa_physique: true }),
];
eq("fait_prepa → savate + boxe-option", ids(filtrerAdherents(prepa, ["fait_prepa"])), "b2,s1");

console.log("\n== echec_paiement ==");
const echec = [
  A("e1", { statut_paiement: "echec_paiement" }),
  A("e2", { statut_paiement: "paye" }),
];
eq("echec_paiement", ids(filtrerAdherents(echec, ["echec_paiement"])), "e1");

console.log("\n== non_reinscrits (cross-saison) ==");
const reins = [
  // p1 : actif l'an dernier, PAS cette saison → non réinscrit (sélectionné).
  A("p1_old", { saison: precedente, email: "p1@x.fr" }),
  // p2 : actif l'an dernier ET cette saison → réinscrit (NON sélectionné).
  A("p2_old", { saison: precedente, email: "p2@x.fr" }),
  A("p2_new", { saison: courante, email: "p2@x.fr" }),
  // p3 : actif cette saison seulement → pas concerné.
  A("p3_new", { saison: courante, email: "p3@x.fr" }),
  // p4 : actif l'an dernier mais ANNULÉ → pas actif → non sélectionné.
  A("p4_old", { saison: precedente, email: "p4@x.fr", annule_at: "2026-01-01" }),
];
eq("non_reinscrits → seulement p1_old", ids(filtrerAdherents(reins, ["non_reinscrits"])), "p1_old");

console.log(ko === 0 ? "\nOK" : `\n${ko} échec(s)`);
process.exit(ko === 0 ? 0 : 1);
