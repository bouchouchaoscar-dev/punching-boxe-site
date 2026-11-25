// [024] Séances ponctuelles + taux horaire / montants.
// Couvre : génération période (ponctuelle exclue), heures (ponctuelle comptée même
// en fermeture), montants (taux à la date, changement en cours de saison, période
// sans taux = « non renseigné », jamais 0 €), planning prof (ponctuelle sur sa seule
// semaine + exclusion du passé), pointage (coursOuverts/coursEnCours pendant une
// fermeture et jour exact). Exécuter : npx tsx scripts/test-seance-ponctuelle-taux.mts
import {
  genererSeancesPeriode,
  calculerHeuresProfs,
  planningProfSemaine,
  tauxPourDate,
  formatMontant,
  mentionSansTaux,
  type Cours,
  type Prof,
  type PeriodeFermeture,
  type TauxHoraire,
} from "../lib/planning";
import { coursOuverts, coursEnCours } from "../lib/presence";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

function cours(p: Partial<Cours> & { id: string }): Cours {
  return {
    id: p.id, actif: p.actif ?? true, libelle: p.libelle ?? "Cours",
    discipline: p.discipline ?? "boxe_francaise", package: null, avec_prepa: false,
    type_adherent: p.type_adherent ?? null, jour_semaine: p.jour_semaine ?? 1,
    heure_debut: p.heure_debut ?? "18:00", heure_fin: p.heure_fin ?? "20:00",
    salle: p.salle ?? "Dojo", ville: p.ville ?? "Nogent", date_unique: p.date_unique ?? null,
  };
}

// 2026-02-14 est un SAMEDI (jour_semaine 6) ; sa semaine commence lundi 2026-02-09.
// Vacances couvrant toute cette semaine.
const vacances: PeriodeFermeture[] = [{ id: "v", libelle: "Vacances", date_debut: "2026-02-09", date_fin: "2026-02-22" } as PeriodeFermeture];
const recurrent = cours({ id: "R", jour_semaine: 1, heure_debut: "18:00", heure_fin: "20:00" }); // lundi 2h
const stage = cours({ id: "S", jour_semaine: 6, date_unique: "2026-02-14", heure_debut: "10:00", heure_fin: "13:00" }); // stage 3h pendant vacances

console.log("\n== Génération période : la ponctuelle est exclue (one-off) ==");
const seances = genererSeancesPeriode([recurrent, stage], "2026-02-02", "2026-02-28", []);
check("aucune séance générée pour le stage ponctuel", seances.every((s) => s.coursId !== "S"), seances);
check("le récurrent génère bien ses lundis", seances.some((s) => s.coursId === "R"));

console.log("\n== Heures : la ponctuelle compte même pendant une fermeture ==");
const profs: Prof[] = [{ id: "P1", actif: true, nom: "Durand", prenom: "Alex", email: null, telephone: null }];
const aff = [
  { cours_id: "R", prof_id: "P1", semaine: "2026-02-09" }, // lundi 2026-02-09 (fermé → exclu)
  { cours_id: "S", prof_id: "P1", semaine: "2026-02-09" }, // stage samedi 2026-02-14 (fermé mais ponctuel → compté)
];
const h = calculerHeuresProfs({ cours: [recurrent, stage], affectations: aff, profs, periodes: vacances, debutISO: "2026-02-01", finISO: "2026-02-28", now: new Date("2026-03-01T00:00:00") });
check("récurrent en semaine fermée → exclu", !h.parProf[0].occurrences.some((o) => o.date === "2026-02-09"), h.parProf[0].occurrences.map((o) => o.date));
check("ponctuelle en fermeture → comptée (3h)", h.parProf[0].occurrences.some((o) => o.date === "2026-02-14" && o.ponctuelle && o.dureeH === 3));
check("total heures réalisées = 3h (stage seul)", h.totalHeuresRealisees === 3, h.totalHeuresRealisees);

console.log("\n== tauxPourDate : taux en vigueur à la date (null avant le 1er) ==");
const hist: TauxHoraire[] = [
  { montant_horaire: 20, date_effet: "2025-09-01" },
  { montant_horaire: 25, date_effet: "2026-02-01" }, // augmentation en cours de saison
];
check("avant tout taux → null", tauxPourDate(hist, "2025-08-31") === null);
check("entre les deux → 20 €", tauxPourDate(hist, "2026-01-15") === 20);
check("après l'augmentation → 25 €", tauxPourDate(hist, "2026-02-14") === 25);

console.log("\n== Montants : taux appliqué selon la date de la séance ==");
const affMontant = [
  { cours_id: "R", prof_id: "P1", semaine: "2026-01-12" }, // lundi 12/01 → 2h à 20 € = 40 €
  { cours_id: "S", prof_id: "P1", semaine: "2026-02-09" }, // stage 14/02 → 3h à 25 € = 75 €
];
const tauxParProf = new Map<string, TauxHoraire[]>([["P1", hist]]);
const hm = calculerHeuresProfs({ cours: [recurrent, stage], affectations: affMontant, profs, periodes: [], debutISO: "2026-01-01", finISO: "2026-02-28", now: new Date("2026-03-01T00:00:00"), tauxParProf });
const occ = hm.parProf[0].occurrences;
check("séance du 12/01 → 40,00 €", occ.find((o) => o.date === "2026-01-12")?.montant === 40, occ);
check("séance du 14/02 → 75,00 € (taux relevé)", occ.find((o) => o.date === "2026-02-14")?.montant === 75);
check("montant total réalisé = 115,00 €", hm.parProf[0].montantRealise === 115, hm.parProf[0].montantRealise);
check("pas de taux manquant ici", hm.parProf[0].tauxManquant === false);
check("0 séance sans taux ici", hm.parProf[0].nbSansTaux === 0 && hm.totalSansTaux === 0);
check("formatMontant deux décimales", formatMontant(115) === "115,00 €");
check("mentionSansTaux vide si 0", mentionSansTaux(0) === "");
check("mentionSansTaux pluriel", mentionSansTaux(6) === " hors 6 séances sans taux");
check("mentionSansTaux singulier", mentionSansTaux(1) === " hors 1 séance sans taux");

console.log("\n== Période SANS taux : « non renseigné », jamais 0 € ==");
const hsans = calculerHeuresProfs({ cours: [recurrent], affectations: [{ cours_id: "R", prof_id: "P1", semaine: "2026-01-12" }], profs, periodes: [], debutISO: "2026-01-01", finISO: "2026-01-31", now: new Date("2026-03-01T00:00:00"), tauxParProf: new Map() });
check("occurrence sans taux → montant null", hsans.parProf[0].occurrences[0].montant === null);
check("prof marqué tauxManquant", hsans.parProf[0].tauxManquant === true);
check("montant réalisé reste 0 (non affiché comme €)", hsans.parProf[0].montantRealise === 0);
check("total global tauxManquant", hsans.tauxManquant === true);
check("nbSansTaux prof = 1", hsans.parProf[0].nbSansTaux === 1);
check("totalSansTaux = 1", hsans.totalSansTaux === 1);

// Cas MIXTE : une séance avec taux + une sans → total partiel + mention honnête.
const histPartiel = new Map<string, TauxHoraire[]>([["P1", [{ montant_horaire: 20, date_effet: "2026-01-01" }]]]);
const hmix = calculerHeuresProfs({
  cours: [recurrent, cours({ id: "R2", jour_semaine: 1, heure_debut: "18:00", heure_fin: "19:00" })],
  affectations: [
    { cours_id: "R", prof_id: "P1", semaine: "2026-01-12" }, // 2h à 20 € = 40 €
    { cours_id: "R2", prof_id: "P1", semaine: "2025-12-01" }, // avant le taux → sans taux
  ],
  profs, periodes: [], debutISO: "2025-11-01", finISO: "2026-01-31", now: new Date("2026-03-01T00:00:00"), tauxParProf: histPartiel,
});
check("mixte : montant partiel = 40 €", hmix.totalMontantRealise === 40, hmix.totalMontantRealise);
check("mixte : 1 séance exclue signalée", hmix.totalSansTaux === 1 && hmix.parProf[0].nbSansTaux === 1);

console.log("\n== planning prof : ponctuelle sur SA semaine, jamais grisée, passé exclu ==");
const semStage = "2026-02-09";
const pl = planningProfSemaine("P1", [recurrent, stage], [{ cours_id: "S", prof_id: "P1" }], semStage, vacances);
check("stage présent sur sa semaine malgré la fermeture", pl.some((c) => c.cours_id === "S"), pl);
const plAutre = planningProfSemaine("P1", [recurrent, stage], [{ cours_id: "S", prof_id: "P1" }], "2026-02-16", vacances);
check("stage ABSENT d'une autre semaine", !plAutre.some((c) => c.cours_id === "S"));
const plPasse = planningProfSemaine("P1", [recurrent, stage], [{ cours_id: "S", prof_id: "P1" }], semStage, vacances, "2026-02-20");
check("séance passée exclue du diff (today=20/02)", plPasse.length === 0, plPasse);

console.log("\n== Pointage : ponctuelle ouverte le jour exact, pendant la fermeture ==");
// Samedi 14/02 à 11h00 (Paris) : le stage 10h-13h est en cours, bien que la semaine
// soit une période de fermeture (les récurrents, eux, seraient fermés).
const samedi11h = new Date("2026-02-14T10:00:00Z"); // 11h Paris (UTC+1 en février)
const ouverts = coursOuverts(samedi11h, { cours: [recurrent, stage], periodes: vacances });
check("stage pointable pendant la fermeture", ouverts.some((o) => o.cours.id === "S"), ouverts.map((o) => o.cours.id));
const enCours = coursEnCours(samedi11h, { cours: [recurrent, stage], periodes: vacances });
check("stage en cours pendant la fermeture", enCours.has("S"));
// Un autre samedi (21/02) : le stage ne doit PAS être ouvert (date fixe).
const autreSamedi = new Date("2026-02-21T10:00:00Z");
check("stage non ouvert un autre samedi (date fixe)", !coursOuverts(autreSamedi, { cours: [stage], periodes: [] }).some((o) => o.cours.id === "S"));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
