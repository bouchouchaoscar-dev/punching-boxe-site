// Tests PURS du module Planning : diff d'envoi, idempotence, reprise, garde-fou.
// Exécuter : npx tsx scripts/test-planning.mts
import {
  planningProfSemaine,
  diffEnvoiPlanning,
  calculerReprise,
  choisirSourceReprise,
  semaineFermee,
  estHistoriqueSemaine,
  type Cours,
  type PeriodeFermeture,
  type CoursEnvoi,
} from "../lib/planning";

let ok = 0;
let ko = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    ok++;
    console.log("  ✓ " + msg);
  } else {
    ko++;
    console.log("  ✗ " + msg);
  }
}

const mkCours = (p: Partial<Cours>): Cours =>
  ({
    id: "c",
    actif: true,
    libelle: "Cours",
    discipline: "boxe_francaise",
    package: null,
    avec_prepa: false,
    type_adherent: "adulte",
    jour_semaine: 1,
    heure_debut: "18:00",
    heure_fin: "19:30",
    salle: null,
    ville: null,
    ...p,
  }) as Cours;

// Semaine type : lundi 2026-03-02. (jours: lundi=1 → 2026-03-02, mercredi=3 → 04)
const S = "2026-03-02";
const cours: Cours[] = [
  mkCours({ id: "c1", jour_semaine: 1, heure_debut: "18:00", heure_fin: "19:30", libelle: "BF Adultes", salle: "A" }),
  mkCours({ id: "c2", jour_semaine: 3, heure_debut: "17:00", heure_fin: "18:00", libelle: "BF Jeunes", salle: "B" }),
  mkCours({ id: "c3", actif: false, jour_semaine: 5, libelle: "Désactivé" }),
];

console.log("— planningProfSemaine (exclut jours fermés, trie) —");
{
  const aff = [
    { cours_id: "c1", prof_id: "p1" },
    { cours_id: "c2", prof_id: "p1" },
  ];
  const sansFerm = planningProfSemaine("p1", cours, aff, S, []);
  check(sansFerm.length === 2, "2 cours pour p1 sans fermeture");
  check(sansFerm[0].jour === 1 && sansFerm[1].jour === 3, "tri par jour (lundi puis mercredi)");
  // Ferme le mercredi 2026-03-04
  const perMer: PeriodeFermeture[] = [{ id: "f", libelle: "Test", date_debut: "2026-03-04", date_fin: "2026-03-04" }];
  const avecFerm = planningProfSemaine("p1", cours, aff, S, perMer);
  check(avecFerm.length === 1 && avecFerm[0].cours_id === "c1", "cours du mercredi exclu (jour fermé)");
}

console.log("— diffEnvoiPlanning (nouveau / identique / maj / retiré / plus_de_cours / rien) —");
{
  const a: CoursEnvoi[] = [
    { cours_id: "c1", jour: 1, date: "2026-03-02", horaire: "18:00 – 19:30", libelle: "BF", salle: "A", ville: null },
  ];
  check(diffEnvoiPlanning(a, null).statut === "nouveau", "jamais envoyé + cours → nouveau");
  check(diffEnvoiPlanning([], null).statut === "rien", "jamais envoyé + aucun cours → rien");
  check(diffEnvoiPlanning(a, a).statut === "identique", "identique → identique");

  const b: CoursEnvoi[] = [{ ...a[0], salle: "C" }]; // salle changée
  check(diffEnvoiPlanning(b, a).statut === "maj", "salle changée → maj");

  const deux = [...a, { cours_id: "c2", jour: 3, date: "2026-03-04", horaire: "17:00 – 18:00", libelle: "J", salle: "B", ville: null }];
  const d = diffEnvoiPlanning(a, deux); // un cours retiré
  check(d.statut === "maj" && d.retires.length === 1 && d.retires[0].cours_id === "c2", "un cours retiré → maj + retires=[c2]");

  const vide = diffEnvoiPlanning([], a);
  check(vide.statut === "plus_de_cours" && vide.retires.length === 1, "devenu vide → plus_de_cours + retires");
}

console.log("— idempotence de l'envoi (après envoi, snapshot = actuel → identique) —");
{
  const actuel = planningProfSemaine("p1", cours, [{ cours_id: "c1", prof_id: "p1" }], S, []);
  const apresEnvoi = diffEnvoiPlanning(actuel, actuel); // snapshot enregistré = actuel
  check(apresEnvoi.statut === "identique", "re-calcul immédiat → identique (aucun renvoi)");
}

console.log("— calculerReprise (ignore fermé / désactivé / déjà affecté) —");
{
  const affSource = [
    { cours_id: "c1", prof_id: "p1" }, // ok
    { cours_id: "c2", prof_id: "p1" }, // sera fermé sur la cible
    { cours_id: "c3", prof_id: "p1" }, // cours désactivé
    { cours_id: "c1", prof_id: "p2" }, // déjà affecté sur la cible
  ];
  const affCible = [{ cours_id: "c1", prof_id: "p2" }];
  const perMer: PeriodeFermeture[] = [{ id: "f", libelle: "V", date_debut: "2026-03-04", date_fin: "2026-03-04" }];
  const r = calculerReprise(S, cours, affSource, affCible, perMer);
  check(r.reprises === 1, "1 seule reprise (c1/p1)");
  check(r.ignorees === 3, "3 ignorées (fermé, désactivé, déjà affecté)");
  check(r.aInserer[0].cours_id === "c1" && r.aInserer[0].prof_id === "p1", "insertion = c1/p1");

  // Prof ARCHIVÉ (p1 non actif) : son affectation n'est pas reprise.
  const r2 = calculerReprise(S, cours, [{ cours_id: "c1", prof_id: "p1" }], [], [], new Set(["p2"]));
  check(r2.reprises === 0 && r2.ignorees === 1, "prof archivé (p1) exclu de la reprise");
  const r3 = calculerReprise(S, cours, [{ cours_id: "c1", prof_id: "p1" }], [], [], new Set(["p1"]));
  check(r3.reprises === 1, "prof actif (p1) repris quand fourni dans profsActifsIds");
}

console.log("— archivage : garde le passé, retire le futur (règle métier) —");
{
  // Modélisation de la décision serveur : seules les affectations FUTURES sont
  // retirées à l'archivage ; les passées/en cours restent (via estHistoriqueSemaine).
  const lundiCourant = "2026-03-02";
  const affsProf = [
    { semaine: "2026-02-16" }, // passé
    { semaine: "2026-03-02" }, // en cours
    { semaine: "2026-03-09" }, // futur
    { semaine: "2026-03-16" }, // futur
  ];
  const futures = affsProf.filter((a) => !estHistoriqueSemaine(a.semaine, lundiCourant));
  const passees = affsProf.filter((a) => estHistoriqueSemaine(a.semaine, lundiCourant));
  check(futures.length === 2, "2 affectations futures libérées à l'archivage");
  check(passees.length === 2, "2 affectations passées/en cours conservées");
}

console.log("— choisirSourceReprise (S-1, ou dernière semaine ouverte si S-1 fermée) —");
{
  check(choisirSourceReprise(S, []).source === "2026-02-23", "sans fermeture → S-1 = 2026-02-23");
  check(choisirSourceReprise(S, []).sourceFermee === false, "S-1 non fermée");
  // Ferme toute la semaine S-1 (23 au 01 mars)
  const perS1: PeriodeFermeture[] = [{ id: "f", libelle: "Vac", date_debut: "2026-02-23", date_fin: "2026-03-01" }];
  const r = choisirSourceReprise(S, perS1);
  check(r.source === "2026-02-16" && r.sourceFermee === true, "S-1 fermée → recule à 2026-02-16 (sourceFermee)");
  check(semaineFermee("2026-02-23", perS1) === true, "semaineFermee détecte la semaine entièrement fermée");
}

console.log("— estHistoriqueSemaine (garde-fou suppression) —");
{
  const lundiCourant = "2026-03-02";
  check(estHistoriqueSemaine("2026-02-23", lundiCourant) === true, "semaine passée → historique (bloque)");
  check(estHistoriqueSemaine("2026-03-02", lundiCourant) === true, "semaine en cours → historique (bloque)");
  check(estHistoriqueSemaine("2026-03-09", lundiCourant) === false, "semaine future → non historique (supprimable)");
}

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
