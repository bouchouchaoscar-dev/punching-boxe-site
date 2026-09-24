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
  prochaineOccurrence,
  genererMailPrevenir,
  calculerHeuresProfs,
  formatDureeHeures,
  construireReponseCoachPlanning,
  type Cours,
  type PeriodeFermeture,
  type CoursEnvoi,
  type Prof,
} from "../lib/planning";
import { redirectionInterneValide } from "../lib/nav-roles";
import { toMembrePublic } from "../lib/trombi-server";
import type { Adherent } from "../lib/types";
import { resoudreOuverture, regrouperParEmail, remplacerVariables, jetonsInconnus, objetAffiche, textesSuppressionHistorique, DEFAULT_TEMPLATES, type PersonneEnvoi } from "../lib/campagnes";
import { estEmailValide, normaliserEmail } from "../lib/email-format";
import { statutCampagne, type ResultatEnvoi } from "../lib/envoi-campagne";
import { estMineur } from "../lib/pricing";

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

console.log("— estMineur / prochaineOccurrence —");
{
  const ref = new Date(2026, 8, 1);
  check(estMineur("2015-01-01", ref) === true, "né en 2015 → mineur");
  check(estMineur("2000-01-01", ref) === false, "né en 2000 → majeur");
  check(estMineur(null, ref) === false, "naissance absente → majeur (défaut)");

  // Cours le mardi (jour 2). Semaine du 2026-09-28 (lundi). Prochaine = 2026-10-06.
  const per: PeriodeFermeture[] = [];
  check(prochaineOccurrence(2, "2026-09-28", per) === "2026-10-06", "prochaine occurrence = mardi suivant");
  const perFerm: PeriodeFermeture[] = [{ id: "f", libelle: "Vac", date_debut: "2026-10-05", date_fin: "2026-10-11" }];
  check(prochaineOccurrence(2, "2026-09-28", perFerm) === "2026-10-13", "saute une semaine fermée");
}

console.log("— resoudreOuverture (majeur / mineur / foyer) —");
{
  const maj = resoudreOuverture([{ prenom: "Marie", mineur: false }]);
  check(maj.salutation === "Bonjour Marie," && maj.concerne === "", "majeur seul → Bonjour Marie,");
  const min = resoudreOuverture([{ prenom: "Lucas", mineur: true }]);
  check(min.salutation === "Bonjour," && min.concerne === "Ce message concerne Lucas.", "mineur → Bonjour, + concerne");
  const foyer = resoudreOuverture([{ prenom: "Lucas", mineur: true }, { prenom: "Inès", mineur: true }]);
  check(foyer.salutation === "Bonjour," && foyer.concerne === "Ce message concerne Lucas et Inès.", "foyer → concerne Lucas et Inès");
}

console.log("— genererMailPrevenir (phrases par motif) —");
{
  const orig = { dateISO: "2026-09-29", heure_debut: "18:00", heure_fin: "19:00", salle: "Dojo David Douillet", ville: "Nogent" };
  const club = "Punching Boxe";
  const lib = "Boxe Française - Enfants";

  const annule = genererMailPrevenir({ libelle: lib, motif: "annule", origine: orig, clubNom: club });
  check(annule.contenu.includes("prévu de 18h à 19h au Dojo David Douillet (Nogent), est annulé."), "annulé : rappel complet + préposition");
  check(!annule.contenu.includes("Prochain cours"), "annulé sans prochain → pas de ligne prochain");
  check(annule.contenu.includes("Merci de votre compréhension.") && annule.contenu.includes("L'équipe Punching Boxe"), "clôture + signature club");
  check(annule.contenu.startsWith("{{salutation}}\n\n{{concerne}}"), "jetons salutation/concerne en tête");

  const annuleProchain = genererMailPrevenir({ libelle: lib, motif: "annule", origine: orig, prochainISO: "2026-10-06", clubNom: club });
  check(annuleProchain.contenu.includes("Prochain cours : mardi 6 octobre, de 18h à 19h au Dojo David Douillet (Nogent)."), "annulé avec prochain cours");

  const depH = genererMailPrevenir({ libelle: lib, motif: "deplace", origine: orig, nouveau: { ...orig, heure_debut: "18:30", heure_fin: "19:30" }, clubNom: club });
  check(depH.contenu.includes("Il aura lieu de 18h30 à 19h30, au même endroit."), "déplacé horaire seul");
  check(depH.objet.includes("déplacé à 18h30"), "objet déplacé à 18h30");

  const depL = genererMailPrevenir({ libelle: lib, motif: "deplace", origine: orig, nouveau: { ...orig, salle: "Gymnase du Port", ville: "Nogent" }, clubNom: club });
  check(depL.contenu.includes("Il aura lieu aux mêmes horaires, au Gymnase du Port (Nogent)."), "déplacé lieu seul");
  check(depL.objet.includes("changement de lieu"), "objet changement de lieu");

  const depB = genererMailPrevenir({ libelle: lib, motif: "deplace", origine: orig, nouveau: { dateISO: orig.dateISO, heure_debut: "18:30", heure_fin: "19:30", salle: "Gymnase du Port", ville: "Nogent" }, clubNom: club });
  check(depB.contenu.includes("Il aura lieu de 18h30 à 19h30, au Gymnase du Port (Nogent)."), "déplacé horaire + lieu");

  const repMeme = genererMailPrevenir({ libelle: lib, motif: "reporte", origine: orig, nouveau: { ...orig, dateISO: "2026-10-01" }, clubNom: club });
  check(repMeme.contenu.includes("est reporté au jeudi 1er octobre, de 18h à 19h, au même endroit."), "reporté même lieu (fusionné)");

  const repAutre = genererMailPrevenir({ libelle: lib, motif: "reporte", origine: orig, nouveau: { dateISO: "2026-10-01", heure_debut: "18:00", heure_fin: "19:00", salle: "Gymnase du Port", ville: "Nogent" }, clubNom: club });
  check(repAutre.contenu.includes("est reporté au jeudi 1er octobre, de 18h à 19h, au Gymnase du Port (Nogent)."), "reporté autre lieu");

  // Lieu non reconnu → pas de préposition devinée, ligne "Lieu : …".
  const inconnu = genererMailPrevenir({ libelle: lib, motif: "annule", origine: { ...orig, salle: "Terrain municipal" }, clubNom: club });
  check(inconnu.contenu.includes("prévu de 18h à 19h, est annulé.") && inconnu.contenu.includes("Lieu : Terrain municipal (Nogent)"), "lieu non reconnu → ligne Lieu séparée");
}

console.log("— ouverture mineur/foyer dans une CAMPAGNE classique (template) —");
{
  const saison = "2025-2026";
  const tpl = DEFAULT_TEMPLATES[0]; // ouverture {{salutation}}\n\n{{concerne}}
  const rendre = (membres: PersonneEnvoi[]) => {
    const { envois } = regrouperParEmail(membres, new Set<string>(), saison);
    return remplacerVariables(tpl.contenu, envois[0].vars);
  };
  const maj = rendre([{ personKey: "a1", email: "m@x.fr", prenom: "Marie", mineur: false, saison }]);
  check(maj.startsWith("Bonjour Marie,\n\n") && !maj.includes("{{"), "majeur → 'Bonjour Marie,' (jetons résolus)");
  const min = rendre([{ personKey: "a2", email: "p@x.fr", prenom: "Lucas", mineur: true, saison }]);
  check(min.startsWith("Bonjour,\n\nCe message concerne Lucas.\n\n"), "mineur → 'Bonjour,' + concerne");
  const foyer = rendre([
    { personKey: "a3", email: "f@x.fr", prenom: "Lucas", mineur: true, saison },
    { personKey: "a4", email: "f@x.fr", prenom: "Inès", mineur: true, saison },
  ]);
  check(foyer.startsWith("Bonjour,\n\nCe message concerne Lucas et Inès.\n\n"), "foyer → concerne Lucas et Inès");
  check(tpl.contenu.startsWith("{{salutation}}\n\n{{concerne}}"), "template mis à jour (jetons en tête)");
}

console.log("— textes suppression historique (annulation si programmée) —");
{
  const prog = textesSuppressionHistorique("planifiee");
  check(prog.annulation === true && prog.titre === "Annuler cette campagne programmée ?" && prog.boutonConfirmer === "Annuler l'envoi" && prog.lienListe === "Annuler", "planifiee → wording d'annulation");
  for (const s of ["envoye", "partiel", "erreur", "individuel", undefined]) {
    const t = textesSuppressionHistorique(s as string | undefined);
    check(t.annulation === false && t.titre === "Supprimer de l'historique" && t.lienListe === "Supprimer", `${s ?? "sans statut"} → wording de suppression`);
  }
}

console.log("— calculerHeuresProfs (réalisé/prévu, multi-profs, fermeture, désactivé, archivé, période) —");
{
  const profsS: Prof[] = [
    { id: "p1", actif: true, nom: "Un", prenom: "Alice", email: null, telephone: null },
    { id: "p2", actif: true, nom: "Deux", prenom: "Bob", email: null, telephone: null },
    { id: "p3", actif: false, nom: "Trois", prenom: "Carla", email: null, telephone: null }, // archivé
  ];
  const coursS: Cours[] = [
    mkCours({ id: "cx", jour_semaine: 1, heure_debut: "18:00", heure_fin: "19:30", libelle: "BF", discipline: "boxe_francaise" }), // 1h30
    mkCours({ id: "cy", actif: false, jour_semaine: 3, heure_debut: "17:00", heure_fin: "18:00", libelle: "Désactivé", discipline: "savate" }), // 1h, cours désactivé
  ];
  const now = new Date(2026, 8, 15, 12, 0); // 15 sept 2026, midi
  // Semaine du 2026-09-07 (lundi) : lundi cx = 2026-09-07 (passé), mercredi cy = 2026-09-09 (passé)
  // Semaine du 2026-09-21 : lundi cx = 2026-09-21 (futur)
  const aff = [
    { cours_id: "cx", prof_id: "p1", semaine: "2026-09-07" }, // réalisé (passé) p1
    { cours_id: "cx", prof_id: "p2", semaine: "2026-09-07" }, // même cours, 2e prof → chacun 1h30
    { cours_id: "cy", prof_id: "p3", semaine: "2026-09-07" }, // cours désactivé, passé, prof archivé → compté
    { cours_id: "cx", prof_id: "p1", semaine: "2026-09-21" }, // futur → prévu p1
  ];
  const periodes: PeriodeFermeture[] = [];
  const r = calculerHeuresProfs({ cours: coursS, affectations: aff, profs: profsS, periodes, debutISO: "2026-09-01", finISO: "2026-09-30", now });

  const p1 = r.parProf.find((x) => x.prof_id === "p1")!;
  check(p1.nbRealises === 1 && Math.abs(p1.heuresRealisees - 1.5) < 1e-9, "p1 : 1 réalisé (1h30)");
  check(p1.nbPrevus === 1 && Math.abs(p1.heuresPrevues - 1.5) < 1e-9, "p1 : 1 prévu (occurrence future)");
  const p2 = r.parProf.find((x) => x.prof_id === "p2")!;
  check(p2.nbRealises === 1 && Math.abs(p2.heuresRealisees - 1.5) < 1e-9, "multi-profs : p2 compte aussi 1h30 sur le même cours");
  const p3 = r.parProf.find((x) => x.prof_id === "p3")!;
  check(!!p3 && p3.actif === false && p3.nbRealises === 1, "prof archivé + cours désactivé : occurrence passée comptée");

  // Fermeture : ferme la semaine du 07 → cx du lundi 07 exclu.
  const rFerm = calculerHeuresProfs({ cours: coursS, affectations: aff, profs: profsS, periodes: [{ id: "f", libelle: "V", date_debut: "2026-09-07", date_fin: "2026-09-09" }], debutISO: "2026-09-01", finISO: "2026-09-30", now });
  const p1f = rFerm.parProf.find((x) => x.prof_id === "p1")!;
  check(p1f.nbRealises === 0 && p1f.nbPrevus === 1, "jour fermé exclu (p1 n'a plus que le prévu)");

  // Frontière réalisé/prévu : occurrence aujourd'hui, fin passée vs future.
  const coursJour: Cours[] = [mkCours({ id: "cj", jour_semaine: 2, heure_debut: "10:00", heure_fin: "11:00" })]; // mardi
  const affJour = [{ cours_id: "cj", prof_id: "p1", semaine: "2026-09-14" }]; // mardi 2026-09-15
  const rAvant = calculerHeuresProfs({ cours: coursJour, affectations: affJour, profs: profsS, periodes: [], debutISO: "2026-09-01", finISO: "2026-09-30", now: new Date(2026, 8, 15, 10, 30) }); // pendant le cours
  check(rAvant.parProf[0].nbPrevus === 1, "occurrence du jour non terminée → prévu");
  const rApres = calculerHeuresProfs({ cours: coursJour, affectations: affJour, profs: profsS, periodes: [], debutISO: "2026-09-01", finISO: "2026-09-30", now: new Date(2026, 8, 15, 11, 30) }); // après le cours
  check(rApres.parProf[0].nbRealises === 1, "occurrence du jour terminée → réalisé");

  // Changement de mois : le cx du 07 sept n'est pas compté en octobre.
  const rOct = calculerHeuresProfs({ cours: coursS, affectations: aff, profs: profsS, periodes: [], debutISO: "2026-10-01", finISO: "2026-10-31", now });
  check(rOct.parProf.length === 0, "hors période (octobre) → rien");

  check(formatDureeHeures(1.5) === "1h30" && formatDureeHeures(21) === "21h" && formatDureeHeures(2.25) === "2h15", "format durée unique (1h30 / 21h / 2h15)");
}

console.log("— redirectionInterneValide (next après login) —");
{
  check(redirectionInterneValide("/admin/planning", "coach") === true, "coach : /admin/planning autorisé");
  check(redirectionInterneValide("/admin/trombinoscope", "coach") === true, "coach : /admin/trombinoscope autorisé");
  check(redirectionInterneValide("/admin/adherents", "coach") === false, "coach : /admin/adherents refusé (retombe défaut)");
  check(redirectionInterneValide("/admin/adherents", "admin") === true, "admin : /admin/adherents autorisé");
  check(redirectionInterneValide("/admin/planning", "admin") === true, "admin : /admin/planning autorisé");
  check(redirectionInterneValide("https://evil.com", "admin") === false, "URL externe refusée");
  check(redirectionInterneValide("//evil.com", "admin") === false, "//evil.com refusé");
  check(redirectionInterneValide("javascript:alert(1)", "admin") === false, "javascript: refusé");
  check(redirectionInterneValide("/\\evil.com", "admin") === false, "backslash refusé");
  check(redirectionInterneValide("/", "admin") === false, "hors /admin refusé");
  check(redirectionInterneValide(null, "admin") === false, "next absent → défaut");
}

console.log("— non-fuite : /api/coach/planning (liste blanche) —");
{
  const rep = construireReponseCoachPlanning({
    cours: [{ id: "c1", actif: true, libelle: "BF", discipline: "boxe_francaise", type_adherent: "adulte", jour_semaine: 1, heure_debut: "18:00", heure_fin: "19:00", salle: "A", ville: "Nogent", secret_montant: 999, adherent_email: "leak@x.fr" }],
    affectations: [{ cours_id: "c1", prof_id: "p1", semaine: "2026-09-07", statut: "prevu", adherent: "leak" }],
    profs: [{ id: "p1", prenom: "Alice", nom: "Un", email: "a@a.fr", telephone: "0600000000", adresse: "12 rue X" }],
    periodes: [{ id: "f1", libelle: "Vac", date_debut: "2026-12-20", date_fin: "2026-12-31", note_interne: "secret" }],
  });
  check(Object.keys(rep.cours[0]).sort().join(",") === "actif,avec_prepa,discipline,heure_debut,heure_fin,id,jour_semaine,libelle,package,salle,type_adherent,ville", "cours : liste blanche stricte");
  check(Object.keys(rep.profs[0]).sort().join(",") === "id,nom,prenom", "profs : uniquement id/prénom/nom");
  check(Object.keys(rep.affectations[0]).sort().join(",") === "cours_id,prof_id,semaine,statut", "affectations : liste blanche");
  check(Object.keys(rep.periodes[0]).sort().join(",") === "date_debut,date_fin,id,libelle", "fermetures : liste blanche");
  check(!/leak@x\.fr|a@a\.fr|0600000000|rue X|secret|999|leak/.test(JSON.stringify(rep)), "aucune valeur sensible dans la réponse coach");
}

console.log("— non-fuite : trombinoscope (toMembrePublic) —");
{
  const adh = {
    id: "idSecret", nom: "Durand", prenom: "Marie", package: "boxe_classique", option_prepa_physique: false,
    type_adherent: "adulte", email: "m@m.fr", telephone: "0611111111", adresse: "5 rue Y", code_postal: "94130",
    date_naissance: "2010-01-01", montant_total: 430, saison: "2025-2026", statut_paiement: "paye",
  } as unknown as Adherent;
  const blob = JSON.stringify(toMembrePublic(adh, null));
  check(!/m@m\.fr|0611111111|rue Y|94130|2010-01-01|430|idSecret/.test(blob), "trombi : aucune donnée sensible (email/tel/adresse/CP/naissance/montant/id)");
}

// ---- Aperçu « Prévenir » : résolution des variables + jetons inconnus ----
{
  const vars = {
    prenom: "Marie et Paul",
    nom: "Durand",
    saison: "2026-2027",
    salutation: "Bonjour,",
    concerne: "Ce message concerne Marie et Paul.",
  };
  // Résolution : tous les jetons connus sont remplacés (dont saison).
  const objet = "Cours {{prenom}} — saison {{saison}}";
  check(
    remplacerVariables(objet, vars) === "Cours Marie et Paul — saison 2026-2027",
    "aperçu : objet résolu (prenom + saison)",
  );
  const corps = "{{salutation}}\n\n{{concerne}}Le cours est annulé.";
  check(
    remplacerVariables(corps, vars) === "Bonjour,\n\nCe message concerne Marie et Paul.Le cours est annulé.",
    "aperçu : corps résolu (salutation + concerne)",
  );
  // Une variable connue sans valeur → chaîne vide (jamais le jeton brut).
  check(remplacerVariables("{{formule}}", vars) === "", "aperçu : variable connue vide → \"\"");

  // Détection de jetons inconnus.
  check(jetonsInconnus("Bonjour {{prenom}}, saison {{saison}}").length === 0, "jetons : aucun inconnu sur texte valide");
  check(
    JSON.stringify(jetonsInconnus("Salut {{prnom}} et {{club}}")) === JSON.stringify(["{{prnom}}", "{{club}}"]),
    "jetons : détecte {{prnom}} et {{club}} (inconnus)",
  );
  check(
    JSON.stringify(jetonsInconnus("{{prenom}} {{xxx}} {{xxx}}")) === JSON.stringify(["{{xxx}}"]),
    "jetons : déduplique et ignore les connus",
  );
}

// ---- Validation du format email (source unique) ----
{
  const valides = ["a@b.fr", "marie.durand@gmail.com", "x+tag@sous.domaine.co.uk", "MARIE@GMAIL.COM", "  jean@club.fr  "];
  for (const e of valides) check(estEmailValide(e), `email valide : ${JSON.stringify(e)}`);
  const invalides = [
    "", " ", "a@b", "a@b.", "a@.fr", "@b.fr", "no-at.fr",
    "jean dupont@club.fr", "jean@ club.fr", "prénom@club.fr", "a@b_c.fr", "deux@@b.fr",
  ];
  for (const e of invalides) check(!estEmailValide(e), `email invalide : ${JSON.stringify(e)}`);
  // Normalisation : trim + minuscules.
  check(normaliserEmail("  Jean@Club.FR ") === "jean@club.fr", "normaliserEmail : trim + minuscules");
}

// ---- Exclusion avant envoi → statut Envoyé vs Partiel ----
{
  const base: ResultatEnvoi = {
    ok: true, emailsEnvoyes: 0, emailsEchoues: 0, personnesCiblees: 0,
    doublons: 0, exclus: 0, exclusSansEmail: 0, exclusInvalides: 0,
    destinatairesListe: [], resultats: [], cible: "",
  };
  // Que des invalides exclus (aucun échec réel) → « Envoyé », pas « Partiel ».
  check(statutCampagne({ ...base, emailsEnvoyes: 10, exclusInvalides: 3 }) === "envoye",
    "statut : invalides exclus (0 échec) → Envoyé");
  // Un échec réel après retry → « Partiel ».
  check(statutCampagne({ ...base, emailsEnvoyes: 9, emailsEchoues: 1 }) === "partiel",
    "statut : un échec réel → Partiel");
  // Zéro envoyé → « erreur ».
  check(statutCampagne({ ...base, emailsEnvoyes: 0, exclusInvalides: 2 }) === "erreur",
    "statut : aucun envoyé → erreur");
}

// ---- Objet « tel qu'envoyé » (affichage historique) ----
{
  check(objetAffiche("Inscriptions {{saison}} ouvertes", "2026-08-31") === "Inscriptions 2026-2027 ouvertes",
    "objetAffiche : {{saison}} résolu via la date d'envoi (31/08/2026 → 2026-2027)");
  check(objetAffiche("Bonjour {{prenom}} !", "2026-08-31") === "Bonjour [prénom] !",
    "objetAffiche : variable personnelle → lisible [prénom]");
  check(objetAffiche("{{salutation}} {{concerne}}", "2026-08-31") === "[bonjour] [destinataire]",
    "objetAffiche : salutation/concerne → lisibles");
}

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
