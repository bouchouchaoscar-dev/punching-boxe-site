// ============================================================================
// Module PRÉSENCE — helpers PURS (fenêtre de pointage + rattachement au cours).
// Fuseau Europe/Paris (DST géré via Intl), entièrement testable. Aucune I/O.
// Réutilise la config (CONFIG_CLUB.modules.presence), les types/​helpers Planning
// (Cours, PeriodeFermeture, estFerme, formatHeure) et la logique de ciblage par
// discipline (adherentDansDiscipline) déjà écrite pour le mailing « prévenir ».
// ============================================================================
import { CONFIG_CLUB } from "./config-club";
import { fr } from "./typo";
import { resoudreOuverture, joindrePrenoms } from "./campagnes";
import {
  estFerme,
  formatHeure,
  adherentDansDiscipline,
  type Cours,
  type PeriodeFermeture,
} from "./planning";

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Ordre d'affichage des cours dans l'onglet Présence (SOURCE UNIQUE,
// partagée admin ↔ coach) : cours EN COURS d'abord, puis les cours À VENIR dans
// l'ordre horaire, puis les cours PASSÉS. Détection « en cours » = coursOuverts
// (même fenêtre). Fonctions PURES (testables). --------------------------------

// Minutes depuis minuit d'une heure "HH:MM" ou "HH:MM:SS" (null si vide/invalide).
export function heureEnMinutes(h?: string | null): number | null {
  if (!h) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(h);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export type BlocOrdonnable = {
  ouvert?: boolean;
  heureDebut?: string | null;
  heureFin?: string | null;
};

// Rang d'un cours : 0 = en cours, 1 = à venir, 2 = passé. `nowMinutes < 0`
// (date ≠ aujourd'hui) → aucun passé/à venir distingué (tri horaire simple).
export function rangCoursPresence(b: BlocOrdonnable, nowMinutes: number): 0 | 1 | 2 {
  if (b.ouvert) return 0;
  const fin = heureEnMinutes(b.heureFin);
  if (nowMinutes >= 0 && fin !== null && fin <= nowMinutes) return 2;
  return 1;
}

// Comparateur de tri (en cours → à venir → passé, puis horaire croissant).
export function comparerBlocsPresence(
  a: BlocOrdonnable,
  b: BlocOrdonnable,
  nowMinutes: number,
): number {
  return (
    rangCoursPresence(a, nowMinutes) - rangCoursPresence(b, nowMinutes) ||
    (a.heureDebut ?? "").localeCompare(b.heureDebut ?? "")
  );
}

export function presenceActif(): boolean {
  return CONFIG_CLUB.modules?.presence?.actif === true;
}

/** Config fenêtre (minutes avant / après le début du cours). */
export function fenetrePresence(): { ouvertureMinutesAvant: number; fermetureMinutesApres: number } {
  const f = CONFIG_CLUB.modules?.presence?.fenetre;
  return {
    ouvertureMinutesAvant: f?.ouvertureMinutesAvant ?? 30,
    fermetureMinutesApres: f?.fermetureMinutesApres ?? 40,
  };
}

/** Slug d'une salle (chaîne libre du planning) pour l'URL du QR. */
export function slugSalle(nom: string | null | undefined): string {
  return (nom ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Composants "heure murale" à Paris pour un instant donné (DST-correct : Intl
// renvoie les bons composants Paris quel que soit l'instant UTC). On compare
// ensuite en minutes-du-jour, ce qui évite tout calcul d'instant sur DST.
export function partiesParis(d: Date): { iso: string; minutes: number; jourSemaine: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = fmt.formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const y = Number(get("year"));
  const mo = Number(get("month"));
  const da = Number(get("day"));
  const h = Number(get("hour"));
  const mi = Number(get("minute"));
  // Jour de semaine 1..7 (lundi..dimanche) calculé sur la date Paris (via UTC
  // pour éviter tout décalage de fuseau local).
  const dow = new Date(Date.UTC(y, mo - 1, da)).getUTCDay(); // 0=dim..6=sam
  return {
    iso: `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`,
    minutes: h * 60 + mi,
    jourSemaine: dow === 0 ? 7 : dow,
  };
}

function minutesDeHM(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export type CoursOuvert = {
  cours: Cours;
  startMin: number; // début en minutes-du-jour (Paris)
  dateISO: string; // date de la séance (jour Paris)
  horaire: string; // "18:00 – 19:30"
};

/**
 * Occurrences du jour dont `maintenant` est dans la fenêtre de pointage
 * [début − ouvertureMinutesAvant ; début + fermetureMinutesApres]. Exclut les
 * jours fermés et les cours inactifs. Filtre optionnel sur la salle (slug).
 */
export function coursOuverts(
  maintenant: Date,
  opts: {
    cours: Cours[];
    periodes: PeriodeFermeture[];
    salle?: string | null; // slug de salle (optionnel)
    fenetre?: { ouvertureMinutesAvant: number; fermetureMinutesApres: number };
  },
): CoursOuvert[] {
  const { cours, periodes } = opts;
  const fen = opts.fenetre ?? fenetrePresence();
  const now = partiesParis(maintenant);
  if (estFerme(now.iso, periodes)) return []; // jour de fermeture → pas de pointage

  // Slug de salle DURCI : on ne filtre que si le slug correspond à une salle
  // réelle du planning. Un slug inconnu (salle renommée après impression du QR)
  // se comporte comme le QR générique (tous les cours ouverts), sans erreur.
  const salleConnue =
    !!opts.salle && cours.some((c) => c.salle && slugSalle(c.salle) === opts.salle);

  const out: CoursOuvert[] = [];
  for (const c of cours) {
    if (!c.actif) continue;
    if (c.jour_semaine !== now.jourSemaine) continue;
    const startMin = minutesDeHM(c.heure_debut);
    if (startMin == null) continue;
    if (now.minutes < startMin - fen.ouvertureMinutesAvant) continue;
    if (now.minutes > startMin + fen.fermetureMinutesApres) continue;
    if (salleConnue && slugSalle(c.salle) !== opts.salle) continue;
    out.push({
      cours: c,
      startMin,
      dateISO: now.iso,
      horaire: `${formatHeure(c.heure_debut)} – ${formatHeure(c.heure_fin)}`,
    });
  }
  return out.sort((a, b) => a.startMin - b.startMin);
}

// Profil de la personne qui pointe.
//  - adhérent : { mineur, pkg, optionPrepa } (la formule filtre la discipline) ;
//  - essayeur : { mineur, essai: true } (aucune formule → toutes disciplines).
export type ProfilPointage = {
  mineur: boolean;
  pkg?: string | null;
  optionPrepa?: boolean;
  essai?: boolean;
};

// Public du cours vs personne : "jeune" → mineur ; "adulte" → majeur ; null → tous.
function publicCompatible(c: Cours, mineur: boolean): boolean {
  if (c.type_adherent === "jeune") return mineur;
  if (c.type_adherent === "adulte") return !mineur;
  return true;
}

// Discipline du cours couverte par la formule (essayeur : toujours vrai).
function disciplineCompatible(c: Cours, profil: ProfilPointage): boolean {
  if (profil.essai) return true;
  if (!c.discipline) return true;
  return adherentDansDiscipline(profil.pkg ?? null, profil.optionPrepa === true, c.discipline);
}

export type Rattachement = {
  mode: "auto" | "choix" | "aucun";
  cours: CoursOuvert[];
  selectionId: string | null; // cours présélectionné (choix) ou rattaché (auto)
};

// Présélection : le cours qui commence le plus tôt À VENIR, sinon celui déjà
// commencé le plus récemment.
function preselection(liste: CoursOuvert[], nowMinutes: number): string | null {
  if (liste.length === 0) return null;
  const aVenir = liste
    .filter((o) => o.startMin >= nowMinutes)
    .sort((a, b) => a.startMin - b.startMin);
  if (aVenir.length > 0) return aVenir[0].cours.id;
  const commences = [...liste].sort((a, b) => b.startMin - a.startMin); // plus récent d'abord
  return commences[0].cours.id;
}

/**
 * Rattache une personne aux cours ouverts selon son profil.
 *  a) cours compatibles (public + discipline) ;
 *  b) un seul compatible → rattachement automatique ;
 *  c) plusieurs → choix, présélection au plus tôt à venir ;
 *  d) aucun compatible mais des cours ouverts → choix parmi TOUS (jamais bloqué) ;
 *  e) aucun cours ouvert → mode "aucun".
 */
export function rattacherCours(
  ouverts: CoursOuvert[],
  profil: ProfilPointage,
  nowMinutes: number,
): Rattachement {
  if (ouverts.length === 0) return { mode: "aucun", cours: [], selectionId: null };
  const compatibles = ouverts.filter(
    (o) => publicCompatible(o.cours, profil.mineur) && disciplineCompatible(o.cours, profil),
  );
  if (compatibles.length === 1) {
    return { mode: "auto", cours: compatibles, selectionId: compatibles[0].cours.id };
  }
  if (compatibles.length > 1) {
    return { mode: "choix", cours: compatibles, selectionId: preselection(compatibles, nowMinutes) };
  }
  // Aucun compatible mais des cours ouverts → on propose tout, jamais de blocage.
  return { mode: "choix", cours: ouverts, selectionId: preselection(ouverts, nowMinutes) };
}

// ============================================================================
// RECHERCHE PUBLIQUE (/presence) — liste blanche stricte : jamais d'email, de
// téléphone, de photo, de statut, de montant ni de date complète. Minimum 3
// caractères, 8 résultats max, année de naissance ajoutée UNIQUEMENT en cas
// d'homonymie (même prénom + nom).
// ============================================================================
export type ResultatRecherche = { id: string; prenom: string; nom: string; annee?: number };

export function chercherAdherentsPublic(
  dossiers: { id: string; prenom: string | null; nom: string | null; date_naissance?: string | null }[],
  terme: string,
  max = 8,
): ResultatRecherche[] {
  const t = norm(terme);
  if (t.length < 3) return [];
  const cle = (d: { prenom: string | null; nom: string | null }) => norm(`${d.prenom ?? ""} ${d.nom ?? ""}`);
  const matches = dossiers.filter((d) => cle(d).includes(t));
  const compte = new Map<string, number>();
  for (const d of matches) compte.set(cle(d), (compte.get(cle(d)) ?? 0) + 1);
  return matches.slice(0, max).map((d) => {
    const homonyme = (compte.get(cle(d)) ?? 0) > 1;
    const annee = d.date_naissance ? Number(String(d.date_naissance).slice(0, 4)) : undefined;
    const base = { id: d.id, prenom: (d.prenom ?? "").trim(), nom: (d.nom ?? "").trim() };
    return homonyme && annee ? { ...base, annee } : base;
  });
}

// ============================================================================
// VUE COACH — liste blanche stricte d'une ligne de présence (aucun email /
// téléphone / montant / date complète). `photo` = data-URI fourni par la route.
// ============================================================================
export type CouleurStatut = "vert" | "orange" | "rouge";
export type LigneCoachPresence = {
  prenom: string;
  nom: string;
  couleur: CouleurStatut | null; // null pour un essai (badge « Essai »)
  statutLabel: string; // libellé de statut en clair (« Réglé », « Espèces… »…)
  cat: "regle" | "especes" | "non_finalise" | null; // catégorie paiement (filtre)
  incomplet: boolean;
  essai: boolean;
  essaiDejaUtilise: boolean;
  horsFormule: boolean;
  heure: string; // "HH:MM"
  photo: string | null; // data-URI (jamais d'URL signée exposée au coach)
};

// Liste blanche STRICTE : ne recopie QUE les champs autorisés. Toute donnée
// sensible (email, téléphone, montant, date de naissance) passée par erreur est
// ignorée (jamais recopiée dans la sortie).
export function construireLignesCoachPresence(
  rows: Array<{
    prenom?: string | null;
    nom?: string | null;
    couleur?: string | null;
    statutLabel?: string | null;
    cat?: string | null;
    incomplet?: boolean;
    essai?: boolean;
    essaiDejaUtilise?: boolean;
    horsFormule?: boolean;
    heure?: string | null;
    photo?: string | null;
    [k: string]: unknown;
  }>,
): LigneCoachPresence[] {
  const okCouleur = (c: unknown): CouleurStatut | null =>
    c === "vert" || c === "orange" || c === "rouge" ? c : null;
  const okCat = (c: unknown): "regle" | "especes" | "non_finalise" | null =>
    c === "regle" || c === "especes" || c === "non_finalise" ? c : null;
  return rows.map((r) => ({
    prenom: String(r.prenom ?? "").trim(),
    nom: String(r.nom ?? "").trim(),
    couleur: r.essai ? null : okCouleur(r.couleur),
    statutLabel: String(r.statutLabel ?? (r.essai ? "Séance d'essai" : "")),
    cat: r.essai ? null : okCat(r.cat),
    incomplet: r.incomplet === true,
    essai: r.essai === true,
    essaiDejaUtilise: r.essaiDejaUtilise === true,
    horsFormule: r.horsFormule === true,
    heure: String(r.heure ?? "").slice(0, 5),
    photo: typeof r.photo === "string" && r.photo.startsWith("data:") ? r.photo : null,
  }));
}

// ============================================================================
// RELANCES D'ESSAI — contenu PUR (testable). VOUVOIEMENT (le mail peut être lu
// par un parent), aucune formulation exigeant un accord masculin/féminin, pas de
// tiret long. [cours] = libellé complet du cours d'essai. Typographie française.
// ============================================================================
export type MailRelanceEssai = {
  objet: string;
  salutation: string;
  corps: string[];
  boutonLabel: string;
  apresBouton?: string;
  signature: string;
};

// Relance d'essai, ÉVENTUELLEMENT GROUPÉE PAR FAMILLE : plusieurs essayeurs
// partageant le même email et la même date de séance reçoivent UN SEUL mail qui
// les nomme tous. L'ouverture (personnel vs foyer) réutilise resoudreOuverture.
// `personnes` = au moins une personne ; single adulte → vouvoiement « vous »,
// sinon (famille ou mineur) → 3e personne.
export function mailRelanceEssai(p: {
  personnes: { prenom: string; mineur: boolean }[];
  coursLabel?: string | null;
  numero: 1 | 2;
  clubNom: string;
}): MailRelanceEssai {
  const personnes = p.personnes.length ? p.personnes : [{ prenom: "", mineur: false }];
  const noms = joindrePrenoms(personnes.map((x) => x.prenom));
  const plural = personnes.length > 1;
  const personnel = personnes.length === 1 && !personnes[0].mineur; // adulte seul
  const { salutation } = resoudreOuverture(personnes);
  const cours = (p.coursLabel || "").trim();
  const coursPart = cours ? ` au cours de ${cours}` : "";
  const equipe = `L'équipe ${p.clubNom}`;
  // Verbes/possessifs accordés au nombre (foyer : 3e personne).
  const ont = plural ? "ont fait leur" : "a fait sa";
  const leur = plural ? "leur" : "lui";
  const boutonTiers = plural ? "Les inscrire" : `Inscrire ${noms}`;

  if (p.numero === 1) {
    const objet = fr("Alors, cette première séance ?");
    if (personnel) {
      return {
        objet,
        salutation,
        corps: [
          fr(`Merci d'avoir participé à votre séance d'essai hier${coursPart}. Nous espérons qu'elle vous a plu !`),
          fr(`Si vous souhaitez nous rejoindre pour la saison, l'inscription se fait en quelques minutes sur notre site : créez votre espace adhérent, puis ouvrez votre dossier d'inscription.`),
        ],
        boutonLabel: "Je m'inscris",
        signature: `À très bientôt sur le ring,\n${equipe}`,
      };
    }
    return {
      objet,
      salutation,
      corps: [
        fr(`${noms} ${ont} séance d'essai hier${coursPart}. Nous espérons qu'elle ${leur} a plu !`),
        fr(`Si vous souhaitez ${plural ? "les" : "l'"}inscrire pour la saison, c'est rapide : créez votre espace adhérent à votre nom, puis ouvrez un dossier d'inscription pour ${plural ? "chacun" : noms}.`),
      ],
      boutonLabel: boutonTiers,
      signature: `À très bientôt au club,\n${equipe}`,
    };
  }

  // Relance 2 (une semaine après, dernier message).
  if (personnel) {
    return {
      objet: "Votre place vous attend au club",
      salutation,
      corps: [
        fr(`Il y a une semaine, vous avez fait votre séance d'essai${coursPart}. Si l'envie de continuer est là, il est encore temps de vous inscrire, en quelques minutes sur notre site.`),
      ],
      boutonLabel: "Je m'inscris",
      apresBouton: "C'est notre dernier message à ce sujet.",
      signature: `À bientôt peut-être,\n${equipe}`,
    };
  }
  return {
    objet: fr(plural ? `Une place attend ${noms} au club` : `Une place attend ${noms} au club`),
    salutation,
    corps: [
      fr(`Il y a une semaine, ${noms} ${ont} séance d'essai${coursPart}. Si vous souhaitez ${plural ? "les" : "l'"}inscrire pour la saison, il est encore temps, en quelques minutes sur notre site.`),
    ],
    boutonLabel: boutonTiers,
    apresBouton: "C'est notre dernier message à ce sujet.",
    signature: `À bientôt peut-être,\n${equipe}`,
  };
}
