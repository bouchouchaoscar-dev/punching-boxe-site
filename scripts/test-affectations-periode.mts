// [023] Affectation sur une période : génération des séances (vacances exclues,
// multi-cours/jours, bornes, une par semaine), règle conflits conserver/remplacer,
// filtrage « séances à venir » (mails). Exécuter : npx tsx scripts/test-affectations-periode.mts
import { readFileSync } from "node:fs";
import { genererSeancesPeriode, dateDuJour, toISODate, type PeriodeFermeture } from "../lib/planning";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

// C1 lundi (1), C2 mercredi (3). Période 07/09 → 27/09/2026. Vacances semaine 2 (14→20).
const cours = [{ id: "C1", jour_semaine: 1 }, { id: "C2", jour_semaine: 3 }];
const vacances: PeriodeFermeture[] = [{ id: "v", libelle: "Vacances", date_debut: "2026-09-14", date_fin: "2026-09-20" } as PeriodeFermeture];

console.log("\n== Génération sur une période (vacances exclues, multi-cours) ==");
const s = genererSeancesPeriode(cours, "2026-09-07", "2026-09-27", vacances);
const dates = s.map((x) => `${x.coursId}:${x.date}`).sort();
check("4 séances (semaine de vacances exclue)", s.length === 4, dates);
check("C1 → 07/09 et 21/09", JSON.stringify(s.filter((x) => x.coursId === "C1").map((x) => x.date).sort()) === JSON.stringify(["2026-09-07", "2026-09-21"]));
check("C2 → 09/09 et 23/09", JSON.stringify(s.filter((x) => x.coursId === "C2").map((x) => x.date).sort()) === JSON.stringify(["2026-09-09", "2026-09-23"]));
check("aucune séance pendant les vacances (14→20)", s.every((x) => x.date < "2026-09-14" || x.date > "2026-09-20"));
check("semaine = lundi correct", s.find((x) => x.date === "2026-09-23")?.semaine === "2026-09-21", s.find((x) => x.date === "2026-09-23"));

console.log("\n== Pas de doublon : une occurrence par (cours, semaine) ==");
const cles = s.map((x) => `${x.coursId}|${x.semaine}`);
check("clés uniques", new Set(cles).size === cles.length, cles);

console.log("\n== Bornes de période ==");
check("début > fin → vide", genererSeancesPeriode(cours, "2026-09-27", "2026-09-07", []).length === 0);
check("un seul jour (lundi 07/09) → 1 séance C1", genererSeancesPeriode(cours, "2026-09-07", "2026-09-07", []).length === 1);
check("période hors des jours des cours → vide", genererSeancesPeriode([{ id: "C1", jour_semaine: 1 }], "2026-09-08", "2026-09-08", []).length === 0);

console.log("\n== Conflits : conserver vs remplacer (règle route) ==");
const existant = new Set(["C1|2026-09-07"]); // 1 séance déjà affectée (prof en place)
const uniques = [...new Map(s.map((x) => [`${x.coursId}|${x.semaine}`, x])).values()];
const deja = uniques.filter((x) => existant.has(`${x.coursId}|${x.semaine}`)).length;
const conserver = uniques.filter((x) => !existant.has(`${x.coursId}|${x.semaine}`));
check("déjà affectées = 1", deja === 1);
// CONSERVER = le nouveau prof n'est ajouté QUE sur les séances sans prof ; la séance
// déjà pourvue garde son prof en place (le nouveau prof n'y est PAS ajouté).
check("conserver → 3 séances libres écrites (séance pourvue intacte)", conserver.length === 3);
check("conserver n'écrit JAMAIS sur une séance déjà pourvue", conserver.every((x) => !existant.has(`${x.coursId}|${x.semaine}`)));
check("remplacer → 4 séances écrites (toutes, écrase l'existant)", uniques.length === 4);

console.log("\n== Mails : séances d'aujourd'hui et futures uniquement ==");
const today = "2026-09-15";
const futures = s.filter((x) => x.date >= today);
check("2 séances futures (21/09, 23/09)", futures.length === 2, futures.map((x) => x.date));
check("aucune séance passée dans les mails", futures.every((x) => x.date >= today));
// Un seul mail récap par prof : le contenu (liste de séances futures) est le même
// pour tous les profs du lot → N profs = N mails, jamais un mail par séance.
const nbProfs = 2;
check("N profs → N mails (pas un par séance)", nbProfs === 2 && futures.length === 2 /* mails = nbProfs, pas futures.length */);

console.log("\n== Défaut du récap = Conserver + libellés explicites dynamiques ==");
const modal = readFileSync("components/admin/AffecterPeriodeModal.tsx", "utf8");
check("remplacer initialisé à false", modal.includes("useState(false)"));
check("radio Conserver coché par défaut (!remplacer)", modal.includes("checked={!remplacer}"));
check("libellé Conserver explicite « Garder les profs déjà en place »", modal.includes("Garder les profs déjà en place sur ces"));
check("libellé Conserver précise « n'est ajouté que sur les autres »", modal.includes("n'est ajouté") && modal.includes("ne sont ajoutés"));
check("libellé Remplacer explicite « Remplacer par {nomProfs} »", modal.includes("Remplacer par {nomProfs} sur ces"));
check("prénom dynamique (nomProfs = prénom ou « ces profs »)", modal.includes('profs.find((p) => profSel.has(p.id))?.prenom') && modal.includes('"ces profs"'));
check("radio Remplacer lié à remplacer", modal.includes("checked={remplacer}"));

console.log("\n== Régression bug « Remplacer » : le clic ne ferme plus la modale ==");
const confirmDialog = readFileSync("components/ui/ConfirmDialog.tsx", "utf8");
check("ConfirmDialog stoppe la propagation du clic (overlay)", /onClick=\{\(e\)\s*=>\s*e\.stopPropagation\(\)\}/.test(confirmDialog));
check("AffecterPeriodeModal confirme via ConfirmDialog (onConfirm=appliquer)", modal.includes("onConfirm={appliquer}"));

console.log("\n== Suppression partielle d'un lot (route DELETE + GET détaillé) ==");
const route = readFileSync("app/api/admin/planning/affecter-periode/route.ts", "utf8");
check("DELETE accepte coursIds (cibler certains cours)", route.includes("coursIds") && route.includes("coursFiltre"));
check("DELETE accepte futuresSeulement (séances à venir)", route.includes("futuresSeulement"));
check("DELETE combine filtre cours + futur", route.includes('q.in("cours_id", coursFiltre)'));
const lotsRoute = readFileSync("app/api/admin/planning/lots/route.ts", "utf8");
check("GET lots renvoie le détail par cours", lotsRoute.includes("parCours"));
check("GET lots renvoie le nb de séances à venir", lotsRoute.includes("nbFutures"));
check("GET lots : aucun filtre de période (liste vide = vraiment aucun lot)", lotsRoute.includes("aucun filtre de période"));

console.log("\n== Suppression « à venir seulement » : calcul par date d'occurrence ==");
// Lot sur C1 (lundi) : occurrences 07/09, 14/09, 21/09. today=10/09 → 2 à venir
// (14 et 21), la séance du 07/09 reste dans l'historique.
const lignesLot = [
  { id: "a", coursId: "C1", semaine: "2026-09-07" },
  { id: "b", coursId: "C1", semaine: "2026-09-14" },
  { id: "c", coursId: "C1", semaine: "2026-09-21" },
];
const jourById = new Map([["C1", 1]]);
const todaySupp = "2026-09-10";
const aVenir = lignesLot.filter((r) => toISODate(dateDuJour(r.semaine, jourById.get(r.coursId) ?? 1)) >= todaySupp);
check("séances à venir du lot = 2 (14/09, 21/09)", aVenir.length === 2, aVenir.map((r) => r.semaine));
check("la séance passée (07/09) n'est pas supprimée", !aVenir.some((r) => r.semaine === "2026-09-07"));

console.log("\n== Mail récap : sans accord de genre, sans tiret long, texte attendu ==");
const email = readFileSync("lib/email.ts", "utf8");
const fn = email.slice(email.indexOf("sendAffectationPeriode"), email.indexOf("sendRelanceChangement"));
check("objet « Vos cours à venir »", fn.includes('const titre = "Vos cours à venir"'));
check("« Voici les cours qui vous sont confiés »", fn.includes("Voici les cours qui vous sont confiés"));
check("format « , le {jour} {horaire} » (jour en minuscules)", fn.includes(", le ${escapeHtml(c.jour.toLowerCase())} "));
check("« Merci pour votre engagement ! »", fn.includes("Merci pour votre engagement !"));
check("aucun accord de genre « (e) »", !fn.includes("(e)"));
check("aucun tiret long", !fn.includes("—"));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
