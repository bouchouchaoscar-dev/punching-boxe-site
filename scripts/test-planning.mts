// Tests PURS du module Planning : diff d'envoi, idempotence, reprise, garde-fou.
// Exécuter : npx tsx scripts/test-planning.mts
import {
  planningProfSemaine,
  diffEnvoiPlanning,
  diffEnvoiDetaille,
  libelleChangements,
  suppressionProfAutorisee,
  calculerReprise,
  choisirSourceReprise,
  semaineFermee,
  estHistoriqueSemaine,
  heureFr,
  plageHoraire,
  formatDateCours,
  formatLieu,
  lieuAvecPreposition,
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

console.log("— helpers de formulation (heures, dates, lieux, prépositions) —");
{
  check(heureFr("18:00") === "18h", "18:00 → 18h (heure pleine)");
  check(heureFr("18:30") === "18h30", "18:30 → 18h30");
  check(heureFr("09:05") === "9h05", "09:05 → 9h05 (minutes paddées)");
  check(plageHoraire("18:00", "19:30") === "de 18h à 19h30", "plage → de 18h à 19h30");

  const ref = new Date(2026, 5, 1); // année de référence 2026
  check(formatDateCours("2026-10-01", ref).includes("1er octobre"), "1er du mois → '1er octobre'");
  check(!formatDateCours("2026-10-01", ref).includes("2026"), "année courante omise");
  check(formatDateCours("2027-01-05", ref).includes("2027"), "année différente affichée");

  check(formatLieu("Gymnase du Port", "Nogent") === "Gymnase du Port (Nogent)", "lieu = salle (ville)");
  check(formatLieu("Dojo de Nogent", "Nogent") === "Dojo de Nogent", "pas de doublon si la salle contient la ville");
  check(formatLieu("", "Nogent") === "Nogent", "salle vide → ville seule");
  check(formatLieu("Salle A", "") === "Salle A", "ville vide → salle seule");

  check(lieuAvecPreposition("Gymnase du Port", "Nogent").texte === "au Gymnase du Port (Nogent)", "Gymnase → au");
  check(lieuAvecPreposition("Salle Jean Jaurès", "").texte === "à la Salle Jean Jaurès", "Salle → à la");
  check(lieuAvecPreposition("Espace Sportif", "").texte === "à l'Espace Sportif", "voyelle → à l'");
  check(lieuAvecPreposition("Halle des sports", "").texte === "à la Halle des sports", "Halle → à la (pas à l')");
  const inconnu = lieuAvecPreposition("Terrain municipal", "");
  check(inconnu.connue === false && inconnu.texte === null, "mot inconnu → pas de préposition devinée");
  const accent = lieuAvecPreposition("Dôjo central", "");
  check(accent.connue === true && !!accent.texte && accent.texte.startsWith("au "), "accents ignorés (Dôjo → au)");
  check(lieuAvecPreposition("", "Nogent").texte === "à Nogent", "ville seule → à Nogent");
}

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

console.log("— diffEnvoiDetaille (ajouté / retiré / modifié par cours_id + combinaisons) —");
{
  const c1: CoursEnvoi = { cours_id: "c1", jour: 1, date: "2026-03-02", horaire: "18:00 – 19:30", libelle: "BF", salle: "A", ville: null };
  const c2: CoursEnvoi = { cours_id: "c2", jour: 3, date: "2026-03-04", horaire: "17:00 – 18:00", libelle: "J", salle: "B", ville: null };
  const c1mod: CoursEnvoi = { ...c1, horaire: "19:00 – 20:30", salle: "C" }; // même cours_id, horaire+salle changés

  // Premier envoi
  const prem = diffEnvoiDetaille([c1], null);
  check(prem.statut === "nouveau" && prem.ajoutes.length === 0 && prem.modifies.length === 0, "premier envoi → nouveau, sans section changements");

  // Ajout d'un cours
  const dA = diffEnvoiDetaille([c1, c2], [c1]);
  check(dA.statut === "maj" && dA.ajoutes.length === 1 && dA.ajoutes[0].cours_id === "c2", "cours ajouté détecté");

  // Retrait d'un cours
  const dR = diffEnvoiDetaille([c1], [c1, c2]);
  check(dR.statut === "maj" && dR.retires.length === 1 && dR.retires[0].cours_id === "c2", "cours retiré détecté");

  // Modification (même cours_id) — NE doit PAS être vu comme retiré+ajouté
  const dM = diffEnvoiDetaille([c1mod], [c1]);
  check(dM.modifies.length === 1 && dM.ajoutes.length === 0 && dM.retires.length === 0, "cours modifié détecté par cours_id (ni ajout ni retrait)");
  check(dM.modifies[0].avant.horaire === "18:00 – 19:30" && dM.modifies[0].apres.horaire === "19:00 – 20:30", "modif garde avant/après");

  // Combinaison ajouté + retiré + modifié
  const dCombo = diffEnvoiDetaille([c1mod, c2], [c1]); // c1 modifié, c2 ajouté
  check(dCombo.modifies.length === 1 && dCombo.ajoutes.length === 1 && dCombo.retires.length === 0, "combinaison ajouté + modifié");

  // Identique
  check(diffEnvoiDetaille([c1], [c1]).statut === "identique", "identique → identique");
  // Plus de cours
  const dVide = diffEnvoiDetaille([], [c1]);
  check(dVide.statut === "plus_de_cours" && dVide.retires.length === 1, "devenu vide → plus_de_cours");
}

console.log("— objet du mail (libelleChangements) —");
{
  check(libelleChangements(1, 1, 0) === "1 cours ajouté, 1 retiré", "1 ajouté + 1 retiré");
  check(libelleChangements(0, 0, 1) === "1 cours modifié", "1 modifié seul → 'cours' présent");
  check(libelleChangements(2, 0, 3) === "2 cours ajoutés, 3 modifiés", "pluriels corrects");
  check(libelleChangements(1, 2, 1) === "1 cours ajouté, 2 retirés, 1 modifié", "trois catégories");
}

console.log("— suppression prof : confirmation requise si historique —");
{
  check(suppressionProfAutorisee(0, false) === true, "sans historique → autorisée sans confirmation");
  check(suppressionProfAutorisee(3, false) === false, "avec historique + non confirmé → refusée (409)");
  check(suppressionProfAutorisee(3, true) === true, "avec historique + confirmé → autorisée");
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
