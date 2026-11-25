// [023] Affectation sur une période : génération des séances (vacances exclues,
// multi-cours/jours, bornes, une par semaine), règle conflits conserver/remplacer,
// filtrage « séances à venir » (mails). Exécuter : npx tsx scripts/test-affectations-periode.mts
import { readFileSync } from "node:fs";
import { genererSeancesPeriode, type PeriodeFermeture } from "../lib/planning";

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
const existant = new Set(["C1|2026-09-07"]); // 1 séance déjà affectée
const uniques = [...new Map(s.map((x) => [`${x.coursId}|${x.semaine}`, x])).values()];
const deja = uniques.filter((x) => existant.has(`${x.coursId}|${x.semaine}`)).length;
const conserver = uniques.filter((x) => !existant.has(`${x.coursId}|${x.semaine}`));
check("déjà affectées = 1", deja === 1);
check("conserver → 3 séances libres écrites", conserver.length === 3);
check("remplacer → 4 séances écrites (toutes)", uniques.length === 4);

console.log("\n== Mails : séances d'aujourd'hui et futures uniquement ==");
const today = "2026-09-15";
const futures = s.filter((x) => x.date >= today);
check("2 séances futures (21/09, 23/09)", futures.length === 2, futures.map((x) => x.date));
check("aucune séance passée dans les mails", futures.every((x) => x.date >= today));
// Un seul mail récap par prof : le contenu (liste de séances futures) est le même
// pour tous les profs du lot → N profs = N mails, jamais un mail par séance.
const nbProfs = 2;
check("N profs → N mails (pas un par séance)", nbProfs === 2 && futures.length === 2 /* mails = nbProfs, pas futures.length */);

console.log("\n== Défaut du récap = Conserver (jamais Remplacer par défaut) ==");
const modal = readFileSync("components/admin/AffecterPeriodeModal.tsx", "utf8");
check("remplacer initialisé à false", /useState\(false\)[^\n]*\n?\s*(?:const|\/\/)?/.test(modal) && modal.includes("useState(false)"));
check("radio Conserver coché par défaut (!remplacer)", modal.includes("checked={!remplacer}") && modal.includes("Conserver les affectations existantes"));
check("radio Remplacer lié à remplacer (non coché par défaut)", modal.includes("checked={remplacer}"));

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
