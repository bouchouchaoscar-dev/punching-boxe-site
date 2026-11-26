// [025] Modification d'une période de fermeture : calcul d'impact (jours qui
// changent d'état), séances récurrentes impactées (ponctuelles exclues), et
// gardes serveur (PATCH nom requis, aucun mail, aperçu d'impact).
// Exécuter : npx tsx scripts/test-fermeture-modif.mts
import { readFileSync } from "node:fs";
import { joursImpactesFermeture, seancesSurJours, type PeriodeFermeture } from "../lib/planning";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};
const P = (debut: string, fin: string): PeriodeFermeture => ({ id: "x", libelle: null, date_debut: debut, date_fin: fin } as PeriodeFermeture);

console.log("\n== Nom seul (dates inchangées) → aucun impact ==");
const r0 = joursImpactesFermeture({ debut: "2026-09-14", fin: "2026-09-20" }, { debut: "2026-09-14", fin: "2026-09-20" }, []);
check("aucun jour ne change d'état", r0.deviennentFermes.length === 0 && r0.redeviennentOuverts.length === 0);

console.log("\n== Allongement : jours en plus deviennent fermés ==");
const rA = joursImpactesFermeture({ debut: "2026-09-14", fin: "2026-09-20" }, { debut: "2026-09-14", fin: "2026-09-27" }, []);
check("7 jours (21→27) deviennent fermés", rA.deviennentFermes.length === 7, rA.deviennentFermes);
check("aucun jour ne redevient ouvert", rA.redeviennentOuverts.length === 0);
check("21/09 inclus, 20/09 non (déjà fermé avant)", rA.deviennentFermes.includes("2026-09-21") && !rA.deviennentFermes.includes("2026-09-20"));

console.log("\n== Raccourcissement : jours retirés redeviennent ouverts ==");
const rB = joursImpactesFermeture({ debut: "2026-09-14", fin: "2026-09-27" }, { debut: "2026-09-14", fin: "2026-09-20" }, []);
check("7 jours (21→27) redeviennent ouverts", rB.redeviennentOuverts.length === 7, rB.redeviennentOuverts);
check("aucun jour ne devient fermé", rB.deviennentFermes.length === 0);

console.log("\n== Une AUTRE fermeture couvre déjà ces jours → pas de changement ==");
const rC = joursImpactesFermeture({ debut: "2026-09-14", fin: "2026-09-20" }, { debut: "2026-09-14", fin: "2026-09-27" }, [P("2026-09-21", "2026-09-27")]);
check("jours déjà fermés par une autre période → aucun impact", rC.deviennentFermes.length === 0 && rC.redeviennentOuverts.length === 0);

console.log("\n== Suppression : toute la plage redevient ouverte ==");
const rD = joursImpactesFermeture({ debut: "2026-09-14", fin: "2026-09-20" }, null, []);
check("7 jours redeviennent ouverts", rD.redeviennentOuverts.length === 7, rD.redeviennentOuverts);
check("rien ne devient fermé", rD.deviennentFermes.length === 0);

console.log("\n== Séances récurrentes sur les jours impactés (ponctuelles exclues) ==");
const cours = [
  { id: "L", jour_semaine: 1, date_unique: null }, // lundi récurrent
  { id: "X", jour_semaine: 2, date_unique: "2026-09-22" }, // ponctuelle mardi 22/09
];
// Jours 21→27/09 : lundi = 21, mardi = 22.
const seances = seancesSurJours(rA.deviennentFermes, cours);
check("1 séance récurrente (lundi 21/09)", seances.length === 1 && seances[0].coursId === "L" && seances[0].date === "2026-09-21", seances);
check("la séance ponctuelle du 22/09 est exclue", !seances.some((s) => s.coursId === "X"));
check("semaine = lundi de la séance", seances[0].semaine === "2026-09-21");

console.log("\n== Gardes serveur : PATCH (nom requis, aucun mail), aperçu d'impact ==");
const route = readFileSync("app/api/admin/planning/fermetures/route.ts", "utf8");
check("route PATCH présente", route.includes("export async function PATCH"));
check("PATCH exige le nom", route.includes("Le nom de la fermeture est requis"));
check("PATCH protégé admin (fail-closed)", /PATCH[\s\S]{0,400}isAdminRequest\(request\)/.test(route));
check("aucun import d'email dans la route fermetures (aucun mail)", !/from "@\/lib\/email"/.test(route));
const impact = readFileSync("app/api/admin/planning/fermetures/impact/route.ts", "utf8");
check("route impact présente + admin", impact.includes("isAdminRequest(request)") && impact.includes("joursImpactesFermeture"));
check("impact compte prof affecté et présences", impact.includes("avecProf") && impact.includes("avecPresences"));
check("impact : lecture seule (aucun insert/update/delete)", !/\.(insert|update|delete)\(/.test(impact));

console.log("\n== UI : bouton Modifier + récap d'impact (libellés) ==");
const page = readFileSync("app/admin/planning/page.tsx", "utf8");
check("bouton Modifier sur chaque fermeture", page.includes("onClick={() => editer(p)}"));
check("récap : « deviennent fermées »", page.includes("deviennent fermées"));
check("récap : « dont … avec un prof affecté »", page.includes("avec un prof affecté") && page.includes("avec des présences pointées"));
check("récap : « redeviennent ouvertes »", page.includes("redeviennent ouvertes"));
check("nom requis en édition seulement", page.includes("!enEdition || !!libelle.trim()"));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
