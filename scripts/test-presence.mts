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
import { MSG_PRESENCES_COURS, type Cours, type PeriodeFermeture } from "../lib/planning";
import { siteUrl, urlPresence } from "../lib/site-url";

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
  // Slug inconnu (salle renommée après impression) → comme le QR générique.
  const inconnu = coursOuverts(now, { cours: [a, b], periodes: [], salle: "salle-supprimee-2019", fenetre: F });
  const generique = coursOuverts(now, { cours: [a, b], periodes: [], fenetre: F });
  check(
    idsOuverts(inconnu).join(",") === idsOuverts(generique).join(",") && inconnu.length === 2,
    "slug inconnu → mêmes cours ouverts que sans salle (générique)",
    idsOuverts(inconnu),
  );
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
  // La logique essai (idempotence + anti-doublon) est factorisée dans le helper partagé.
  check(/23505/.test(read("lib/presence-server.ts")), "essai (helper) : doublon (23505) toléré (idempotent)");
  check(/from\("essais"\)[\s\S]*\.eq\("email"[\s\S]*\.eq\("cours_id"[\s\S]*\.eq\("date_seance"/.test(read("lib/presence-server.ts")), "essai (helper) : anti-doublon email+cours+date");
  // Cron relances : claim atomique + exclusions + purge.
  const cron = read("app/api/cron/presence/route.ts");
  check(/\.is\(colClaim, null\)/.test(cron), "cron : claim atomique (relance non re-envoyée)");
  check(/chargerExclusions/.test(cron) && /marquerSiConverti/.test(cron), "cron : exclusions bounce/désinscrit + arrêt si converti");
}

// ---- Suppression de cours : prise en compte des présences ----
console.log("[Présence — suppression de cours]");
{
  const read = (p: string) => readFileSync(p, "utf8");
  check(/présences/i.test(MSG_PRESENCES_COURS) && /désactivez/i.test(MSG_PRESENCES_COURS), "message présences : mentionne présences + Désactiver");
  for (const p of ["app/api/admin/planning/cours/[id]/route.ts", "app/api/admin/planning/cours/bulk-delete/route.ts"]) {
    const src = read(p);
    // Cas 1 : présences existantes → 409 + MSG_PRESENCES_COURS.
    check(/from\("presences"\)[\s\S]*count: "exact"[\s\S]*eq?/.test(src) || /from\("presences"\)/.test(src), `${p.split("/").slice(-2)[0]} : vérifie les présences avant suppression`);
    check(/MSG_PRESENCES_COURS[\s\S]*status: 409/.test(src), `${p.split("/").slice(-2)[0]} : 409 + message présences`);
    // Cas 2 : filet 23503 → 409 (jamais 500).
    check(/error\.code === "23503"[\s\S]*MSG_PRESENCES_COURS[\s\S]*status: 409/.test(src), `${p.split("/").slice(-2)[0]} : 23503 traduit en 409 lisible`);
  }
}

// ---- URL du QR / liens : depuis NEXT_PUBLIC_SITE_URL, fail-closed ----
console.log("[Présence — URL canonique]");
{
  const CANON = "https://www.punching-boxe.com";
  process.env.NEXT_PUBLIC_SITE_URL = CANON;
  const u = urlPresence("dojo-david-douillet");
  check(u === `${CANON}/presence?salle=dojo-david-douillet`, "urlPresence : commence par NEXT_PUBLIC_SITE_URL + slug", u);
  check((urlPresence() ?? "").startsWith(CANON), "urlPresence sans slug : base canonique", urlPresence());
  check(!/vercel\.app/.test(u ?? ""), "urlPresence : jamais une URL de déploiement Vercel");
  // Fail-closed : variable absente → null (l'appelant échoue proprement).
  process.env.NEXT_PUBLIC_SITE_URL = "";
  check(siteUrl() === null && urlPresence("x") === null, "fail-closed : NEXT_PUBLIC_SITE_URL absente → null");
  process.env.NEXT_PUBLIC_SITE_URL = CANON; // restore
}

// ---- Affiche : URL canonique + fail-closed ; plus d'URL sous le QR ----
{
  const src = readFileSync("app/api/admin/presence/affiche/route.tsx", "utf8");
  check(/urlPresence\(/.test(src), "affiche : construit l'URL via urlPresence (NEXT_PUBLIC_SITE_URL)");
  check(/if \(!url\)[\s\S]*status: 503/.test(src), "affiche : fail-closed 503 si URL canonique absente");
  // Anti-cache : route dynamique + no-store + nom de fichier horodaté.
  check(/dynamic = "force-dynamic"/.test(src) && /revalidate = 0/.test(src), "affiche : route dynamique (force-dynamic, revalidate 0)");
  check(/Cache-Control": "no-store/.test(src), "affiche : Cache-Control no-store");
  check(/horodatage\(\)/.test(src) && /affiche-presence-\$\{slug \|\| "generique"\}-\$\{horodatage\(\)\}/.test(src), "affiche : nom de fichier horodaté");
  // Générateur UNIQUE : le PDF est rendu depuis AfficheQR (source 67f01b0).
  check(/AfficheQRDoc/.test(src), "affiche : un seul générateur (AfficheQRDoc)");
  const doc = readFileSync("lib/pdf/AfficheQR.tsx", "utf8");
  check(!/s\.url|styles?\.url|\{data\.url\}/.test(doc), "affiche : plus d'URL affichée sous le QR");
  check(/signale ta présence en 2 clics/.test(doc), "affiche : nouveau titre");
  check(/Clique sur/.test(doc), "affiche : « Clique sur … »");
  check(!/Touche|10 secondes/.test(doc), "affiche : plus de « Touche » ni « 10 secondes »");
}

// ---- Rendu réel de l'affiche : produit bien un PDF (générateur courant) ----
{
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { AfficheQRDoc } = await import("../lib/pdf/AfficheQR");
  const qr = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
  const buf = await renderToBuffer(AfficheQRDoc({ data: { salle: "Dojo David Douillet", qrDataUri: qr } }));
  check(buf.length > 1000 && buf.subarray(0, 5).toString("latin1") === "%PDF-", "affiche : rendu réel → PDF valide");
}

// ---- Ajout d'un essai depuis l'admin (source unique + garde-fous) ----
console.log("[Présence — essai admin]");
{
  const admin = readFileSync("app/api/admin/presence/essai/route.ts", "utf8");
  check(/isAdminRequest\(request\)/.test(admin), "essai admin : garde isAdminRequest (refusé sans rôle)");
  check(/attacherPresenceEssai\(/.test(admin), "essai admin : réutilise attacherPresenceEssai (source unique)");
  check(/source: "manuel"/.test(admin) && /createdBy: "admin"/.test(admin), "essai admin : source 'manuel' + created_by");
  check(/estEmailValide\(email\)/.test(admin), "essai admin : validation email serveur");
  const pub = readFileSync("app/api/presence/essai/route.ts", "utf8");
  check(/attacherPresenceEssai\(/.test(pub), "essai public : même logique partagée (attacherPresenceEssai)");
  // La logique partagée : dossier correspondant → présence dossier (pas d'essai).
  const srv = readFileSync("lib/presence-server.ts", "utf8");
  check(/trouverDossierCorrespondant[\s\S]*dossier_id: dossier\.id/.test(srv), "attacherPresenceEssai : correspondance dossier → présence sur le dossier");
  check(/from\("essais"\)[\s\S]*eq\("email"[\s\S]*eq\("cours_id"[\s\S]*eq\("date_seance"/.test(srv), "attacherPresenceEssai : anti-doublon email+cours+date");
}

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
