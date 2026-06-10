// Test du croisement listes intelligentes × type (jeune/adulte).
// npx --yes tsx scripts/test-filtres.mts
import { filtrerAdherents } from "../lib/campagnes";
import type { Adherent } from "../lib/types";

const A = (id: string, type: "adulte" | "jeune", pkg: "boxe_classique" | "savate_prepa") =>
  ({ id, type_adherent: type, package: pkg, option_prepa_physique: false } as unknown as Adherent);

const data = [
  A("a1", "adulte", "boxe_classique"),
  A("a2", "adulte", "savate_prepa"),
  A("j1", "jeune", "boxe_classique"),
  A("j2", "jeune", "savate_prepa"),
];
const ids = (xs: Adherent[]) => xs.map((x) => x.id).sort().join(",");
let ko = 0;
function eq(label: string, got: string, exp: string) {
  if (got === exp) console.log("  ✓", label);
  else {
    ko++;
    console.log("  ✗", label, "→", got, "≠", exp);
  }
}

eq("tous", ids(filtrerAdherents(data, ["tous"])), "a1,a2,j1,j2");
eq("tous + adultes → adultes", ids(filtrerAdherents(data, ["tous", "adultes"])), "a1,a2");
eq("tous + jeunes → jeunes", ids(filtrerAdherents(data, ["tous", "jeunes"])), "j1,j2");
eq("adultes seul", ids(filtrerAdherents(data, ["adultes"])), "a1,a2");
eq("jeunes seul", ids(filtrerAdherents(data, ["jeunes"])), "j1,j2");
eq("adultes + jeunes → tous", ids(filtrerAdherents(data, ["adultes", "jeunes"])), "a1,a2,j1,j2");
eq("boxe + jeunes → jeune boxe", ids(filtrerAdherents(data, ["boxe", "jeunes"])), "j1");
eq("savate seul", ids(filtrerAdherents(data, ["savate"])), "a2,j2");
eq("savate + adultes", ids(filtrerAdherents(data, ["savate", "adultes"])), "a2");
eq("vide → rien", ids(filtrerAdherents(data, [])), "");

console.log(ko === 0 ? "\nOK" : `\n${ko} échec(s)`);
process.exit(ko === 0 ? 0 : 1);
