// Tests PURS du module Présence : fenêtre de pointage (Europe/Paris + DST),
// rattachement au cours, recherche publique (liste blanche), relances d'essai,
// liste blanche coach. Exécuter : npx tsx scripts/test-presence.mts
import { readFileSync } from "node:fs";
import {
  coursOuverts,
  rattacherCours,
  partiesParis,
  slugSalle,
  chercherAdherentsPublic,
  mailRelanceEssai,
  construireLignesCoachPresence,
  type CoursOuvert,
} from "../lib/presence";
import type { Cours, PeriodeFermeture } from "../lib/planning";

let ok = 0;
let ko = 0;
function check(cond: boolean, msg: string, got?: unknown) {
  if (cond) {
    ok++;
    console.log(`  ✓ ${msg}`);
  } else {
    ko++;
    console.log(`  ✗ ${msg}` + (got !== undefined ? `  → ${JSON.stringify(got)}` : ""));
  }
}

const F = { ouvertureMinutesAvant: 30, fermetureMinutesApres: 40 };
function cours(p: Partial<Cours> & { id: string }): Cours {
  return {
    id: p.id,
    actif: p.actif ?? true,
    libelle: p.libelle ?? "Cours",
    discipline: p.discipline ?? "boxe_francaise",
    package: null,
    avec_prepa: false,
    type_adherent: p.type_adherent ?? null,
    jour_semaine: p.jour_semaine ?? 1,
    heure_debut: p.heure_debut ?? "18:00",
    heure_fin: p.heure_fin ?? "19:00",
    salle: p.salle ?? "Dojo David Douillet",
    ville: p.ville ?? "Nogent",
  };
}
const idsOuverts = (l: CoursOuvert[]) => l.map((o) => o.cours.id).sort();

// ---- Fenêtre + rattachement : cours enfants 18h-19h / adultes 19h ----
console.log("[Présence — fenêtre & rattachement]");
{
  // Mercredi 30/09/2026 (CEST +02:00). jourSemaine calculé pour robustesse.
  const now = new Date("2026-09-30T18:40:00+02:00");
  const js = partiesParis(now).jourSemaine;
  const nowMin = partiesParis(now).minutes; // 18*60+40 = 1120
  const enfants = cours({ id: "enf", type_adherent: "jeune", heure_debut: "18:00", heure_fin: "19:00", jour_semaine: js });
  const adultes = cours({ id: "adu", type_adherent: "adulte", heure_debut: "19:00", heure_fin: "20:30", jour_semaine: js });
  const list = coursOuverts(now, { cours: [enfants, adultes], periodes: [], fenetre: F });
  check(idsOuverts(list).join(",") === "adu,enf", "18h40 : enfants (fin de fenêtre) ET adultes ouverts", idsOuverts(list));

  // Adulte à 18h40 → rattaché aux adultes (public adulte + discipline BF).
  const rAdulte = rattacherCours(list, { mineur: false, pkg: "boxe_classique", optionPrepa: false }, nowMin);
  check(rAdulte.mode === "auto" && rAdulte.selectionId === "adu", "adulte 18h40 → auto adultes", rAdulte);
  // Enfant (essai mineur) à 18h40 → rattaché aux enfants.
  const rEnfant = rattacherCours(list, { mineur: true, essai: true }, nowMin);
  check(rEnfant.mode === "auto" && rEnfant.selectionId === "enf", "enfant 18h40 → auto enfants", rEnfant);
}

// ---- Retardataire +39 accepté / +41 refusé ; -31 refusé ----
{
  const js = partiesParis(new Date("2026-09-30T19:00:00+02:00")).jourSemaine;
  const c19 = cours({ id: "c19", heure_debut: "19:00", jour_semaine: js });
  const p39 = new Date("2026-09-30T19:39:00+02:00");
  const p41 = new Date("2026-09-30T19:41:00+02:00");
  check(coursOuverts(p39, { cours: [c19], periodes: [], fenetre: F }).length === 1, "+39 min accepté");
  check(coursOuverts(p41, { cours: [c19], periodes: [], fenetre: F }).length === 0, "+41 min refusé");
  const c18 = cours({ id: "c18", heure_debut: "18:00", jour_semaine: partiesParis(new Date("2026-09-30T17:29:00+02:00")).jourSemaine });
  const avant31 = new Date("2026-09-30T17:29:00+02:00");
  check(coursOuverts(avant31, { cours: [c18], periodes: [], fenetre: F }).length === 0, "-31 min refusé");
  const avant30 = new Date("2026-09-30T17:30:00+02:00");
  check(coursOuverts(avant30, { cours: [c18], periodes: [], fenetre: F }).length === 1, "-30 min accepté (bord)");
}

// ---- Jour de fermeture ----
{
  const now = new Date("2026-09-30T18:40:00+02:00");
  const js = partiesParis(now).jourSemaine;
  const c = cours({ id: "c", heure_debut: "18:00", jour_semaine: js });
  const periodes: PeriodeFermeture[] = [{ id: "p", libelle: "Vacances", date_debut: "2026-09-28", date_fin: "2026-10-05" }];
  check(coursOuverts(now, { cours: [c], periodes, fenetre: F }).length === 0, "jour de fermeture → aucun cours ouvert");
}

// ---- Changement d'heure (bascule automne 25/10/2026, Paris CET +01:00) ----
{
  const now = new Date("2026-10-25T18:40:00+01:00");
  const pp = partiesParis(now);
  check(pp.minutes === 18 * 60 + 40, "DST : minutes Paris correctes le jour du changement d'heure", pp);
  const c = cours({ id: "dst", heure_debut: "18:00", jour_semaine: pp.jourSemaine });
  check(coursOuverts(now, { cours: [c], periodes: [], fenetre: F }).length === 1, "DST : cours 18h ouvert à 18h40");
}

// ---- Deux salles simultanées ----
{
  const now = new Date("2026-09-30T18:40:00+02:00");
  const js = partiesParis(now).jourSemaine;
  const a = cours({ id: "A", salle: "Dojo David Douillet", heure_debut: "19:00", jour_semaine: js });
  const b = cours({ id: "B", salle: "Gymnase du Port", heure_debut: "19:00", jour_semaine: js });
  const tous = coursOuverts(now, { cours: [a, b], periodes: [], fenetre: F });
  check(idsOuverts(tous).join(",") === "A,B", "deux salles : les deux ouvertes sans filtre", idsOuverts(tous));
  const filtre = coursOuverts(now, { cours: [a, b], periodes: [], salle: slugSalle("Dojo David Douillet"), fenetre: F });
  check(idsOuverts(filtre).join(",") === "A", "filtre salle : seul le Dojo", idsOuverts(filtre));
}

// ---- Formule sans la discipline → jamais bloqué (choix parmi tous) ----
{
  const now = new Date("2026-09-30T18:40:00+02:00");
  const js = partiesParis(now).jourSemaine;
  const bf = cours({ id: "bf", discipline: "boxe_francaise", type_adherent: null, heure_debut: "19:00", jour_semaine: js });
  const list = coursOuverts(now, { cours: [bf], periodes: [], fenetre: F });
  // Adhérent Savate (pkg savate_prepa) → BF non couvert par sa formule.
  const r = rattacherCours(list, { mineur: false, pkg: "savate_prepa", optionPrepa: false }, partiesParis(now).minutes);
  check(r.mode === "choix" && r.cours.some((o) => o.cours.id === "bf"), "formule sans la discipline → choix parmi tous (jamais bloqué)", r);
}

// ---- Présélection : le plus tôt à venir ----
{
  // 18h50 : les deux fenêtres sont ouvertes (19:00 dès 18:30 ; 19:15 dès 18:45).
  const now = new Date("2026-09-30T18:50:00+02:00");
  const js = partiesParis(now).jourSemaine;
  const nowMin = partiesParis(now).minutes;
  const c19 = cours({ id: "c19", type_adherent: null, heure_debut: "19:00", jour_semaine: js });
  const c1915 = cours({ id: "c1915", type_adherent: null, heure_debut: "19:15", jour_semaine: js });
  const list = coursOuverts(now, { cours: [c1915, c19], periodes: [], fenetre: F });
  const r = rattacherCours(list, { mineur: false, essai: true }, nowMin);
  check(r.mode === "choix" && r.selectionId === "c19", "présélection : cours à venir le plus tôt (19:00)", r.selectionId);
}

// ---- Aucun cours ouvert ----
{
  const now = new Date("2026-09-30T23:59:00+02:00");
  const r = rattacherCours([], { mineur: false, essai: true }, partiesParis(now).minutes);
  check(r.mode === "aucun", "aucun cours ouvert → mode aucun");
}

// ---- Recherche publique : min 3 car, 8 max, homonymes, aucune fuite ----
console.log("[Présence — recherche publique]");
{
  const dossiers = [
    { id: "1", prenom: "Marie", nom: "Durand", date_naissance: "2010-05-01", email: "m@x.fr", telephone: "0600000000" },
    { id: "2", prenom: "Marie", nom: "Durand", date_naissance: "2012-03-02" },
    { id: "3", prenom: "Marc", nom: "Dupont", date_naissance: "1990-01-01" },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, prenom: "Dominique", nom: `Martin${i}`, date_naissance: "2000-01-01" })),
  ];
  check(chercherAdherentsPublic(dossiers, "ma").length === 0, "recherche : < 3 caractères → vide");
  const rDur = chercherAdherentsPublic(dossiers, "dur");
  check(rDur.length === 2 && rDur.every((r) => r.annee !== undefined), "recherche : homonymes → année ajoutée", rDur);
  const rDom = chercherAdherentsPublic(dossiers, "dominique");
  check(rDom.length === 8, "recherche : 8 résultats maximum", rDom.length);
  check(rDom.every((r) => r.annee === undefined), "recherche : pas d'année si pas d'homonymie (Martin0..)", rDom[0]);
  const blob = JSON.stringify(chercherAdherentsPublic(dossiers, "durand"));
  check(!/m@x\.fr|0600000000|2010-05-01|telephone|email/.test(blob), "recherche : aucune fuite (email/tel/date complète)", blob);
  check(/"id"|"prenom"|"nom"/.test(blob), "recherche : champs id/prénom/nom présents");
}

// ---- Relances d'essai : ton mineur (parent) vs majeur ----
console.log("[Présence — relances essai]");
{
  const r1Adulte = mailRelanceEssai({ prenom: "Sarah", mineur: false, coursLabel: "Boxe Française", numero: 1 });
  check(r1Adulte.objet === "Alors, cette première séance ?", "relance 1 : objet");
  check(r1Adulte.salutation === "Bonjour Sarah,", "relance 1 majeur : salutation personnelle", r1Adulte.salutation);
  check(r1Adulte.corps.join(" ").includes("ta séance d'essai"), "relance 1 majeur : « ta séance d'essai »");
  const r1Mineur = mailRelanceEssai({ prenom: "Lucas", mineur: true, coursLabel: "Boxe Française", numero: 1 });
  check(r1Mineur.salutation === "Bonjour,", "relance 1 mineur : salutation au parent (générique)", r1Mineur.salutation);
  check(r1Mineur.corps.join(" ").includes("la séance d'essai de Lucas"), "relance 1 mineur : « la séance d'essai de Lucas »");
  const r2 = mailRelanceEssai({ prenom: "Sarah", mineur: false, numero: 2 });
  check(r2.objet === "Ta place t'attend au club", "relance 2 : objet");
  check(!/—/.test([r1Adulte, r1Mineur, r2].flatMap((r) => r.corps).join(" ")), "relances : aucun tiret long");
}

// ---- Liste blanche coach : aucune fuite ----
console.log("[Présence — liste blanche coach]");
{
  const lignes = construireLignesCoachPresence([
    { prenom: "Marie", nom: "Durand", couleur: "vert", essai: false, heure: "18:32:10", photo: "data:image/png;base64,AAA", email: "leak@x.fr", montant: 430, telephone: "0600000000" },
    { prenom: "Paul", nom: "Martin", essai: true, heure: "18:40", couleur: "rouge", photo: "https://signed.example/leak.jpg" },
  ]);
  check(lignes[0].heure === "18:32", "coach : heure tronquée HH:MM");
  check(lignes[0].photo === "data:image/png;base64,AAA", "coach : photo data-URI conservée");
  check(lignes[1].couleur === null && lignes[1].essai === true, "coach : essai → couleur null + badge");
  check(lignes[1].photo === null, "coach : URL signée (non data-URI) rejetée");
  const blob = JSON.stringify(lignes);
  check(!/leak@x\.fr|430|0600000000|montant|email|signed\.example/.test(blob), "coach : aucune donnée sensible", blob);
}

// ---- Garde-fous des routes (module off + idempotence) ----
console.log("[Présence — garde-fous routes]");
{
  const read = (p: string) => readFileSync(p, "utf8");
  const publiques = [
    "app/api/presence/cours-ouverts/route.ts",
    "app/api/presence/recherche/route.ts",
    "app/api/presence/pointer/route.ts",
    "app/api/presence/essai/route.ts",
  ];
  for (const p of publiques) check(/if \(!presenceActif\(\)\)/.test(read(p)), `route ${p.split("/").slice(-2)[0]} : gate presenceActif (404 si off)`);
  const admins = [
    "app/api/admin/presence/jour/route.ts",
    "app/api/admin/presence/ajouter/route.ts",
    "app/api/admin/presence/retirer/route.ts",
    "app/api/admin/presence/semaine/route.ts",
  ];
  for (const p of admins) check(/isAdminRequest\(request\)/.test(read(p)), `route ${p.split("/").slice(-2)[0]} : garde isAdminRequest`);
  check(/hasRole\(request, \["coach", "admin"\]\)/.test(read("app/api/coach/presence/route.ts")), "route coach : hasRole strict");
  // Idempotence : le pointage et l'essai traitent le doublon (code 23505) en succès.
  check(/23505/.test(read("app/api/presence/pointer/route.ts")), "pointer : doublon (23505) toléré (idempotent)");
  check(/23505/.test(read("app/api/presence/essai/route.ts")), "essai : doublon (23505) toléré (idempotent)");
  check(/from\("essais"\)[\s\S]*\.eq\("email"[\s\S]*\.eq\("cours_id"[\s\S]*\.eq\("date_seance"/.test(read("app/api/presence/essai/route.ts")), "essai : anti-doublon email+cours+date");
  // Cron relances : claim atomique + exclusions + purge.
  const cron = read("app/api/cron/presence/route.ts");
  check(/\.is\(colClaim, null\)/.test(cron), "cron : claim atomique (relance non re-envoyée)");
  check(/chargerExclusions/.test(cron) && /marquerSiConverti/.test(cron), "cron : exclusions bounce/désinscrit + arrêt si converti");
}

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
