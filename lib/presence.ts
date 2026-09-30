// ============================================================================
// Module PRÉSENCE — helpers PURS (fenêtre de pointage + rattachement au cours).
// Fuseau Europe/Paris (DST géré via Intl), entièrement testable. Aucune I/O.
// Réutilise la config (CONFIG_CLUB.modules.presence), les types/​helpers Planning
// (Cours, PeriodeFermeture, estFerme, formatHeure) et la logique de ciblage par
// discipline (adherentDansDiscipline) déjà écrite pour le mailing « prévenir ».
// ============================================================================
import { CONFIG_CLUB } from "./config-club";
import { resoudreOuverture } from "./campagnes";
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
  essai: boolean;
  heure: string; // "HH:MM"
  photo: string | null; // data-URI (jamais d'URL signée exposée au coach)
};

export function construireLignesCoachPresence(
  rows: Array<{
    prenom?: string | null;
    nom?: string | null;
    couleur?: string | null;
    essai?: boolean;
    heure?: string | null;
    photo?: string | null;
    [k: string]: unknown;
  }>,
): LigneCoachPresence[] {
  const okCouleur = (c: unknown): CouleurStatut | null =>
    c === "vert" || c === "orange" || c === "rouge" ? c : null;
  return rows.map((r) => ({
    prenom: String(r.prenom ?? "").trim(),
    nom: String(r.nom ?? "").trim(),
    couleur: r.essai ? null : okCouleur(r.couleur),
    essai: r.essai === true,
    heure: String(r.heure ?? "").slice(0, 5),
    photo: typeof r.photo === "string" && r.photo.startsWith("data:") ? r.photo : null,
  }));
}

// ============================================================================
// RELANCES D'ESSAI — contenu PUR (objet + salutation + corps), testable. Le ton
// s'adapte au parent quand la personne est mineure (« la séance d'essai de … »).
// Pas de tiret long dans les textes.
// ============================================================================
export function mailRelanceEssai(p: {
  prenom: string;
  mineur: boolean;
  coursLabel?: string | null;
  numero: 1 | 2;
}): { objet: string; salutation: string; corps: string[]; boutonLabel: string } {
  const prenom = (p.prenom || "").trim();
  const { salutation } = resoudreOuverture([{ prenom, mineur: p.mineur }]);
  const coursPart = p.coursLabel ? ` au cours de ${p.coursLabel}` : "";
  const boutonLabel = "Je m'inscris";
  if (p.numero === 1) {
    return {
      objet: "Alors, cette première séance ?",
      salutation,
      boutonLabel,
      corps: p.mineur
        ? [
            `On espère que la séance d'essai de ${prenom} d'hier${coursPart} lui a plu.`,
            `Si vous souhaitez l'inscrire pour continuer avec nous, l'inscription se fait en quelques minutes en ligne.`,
          ]
        : [
            `On espère que ta séance d'essai d'hier${coursPart} t'a plu.`,
            `Si tu veux revenir t'entraîner avec nous, l'inscription se fait en quelques minutes en ligne.`,
          ],
    };
  }
  return {
    objet: "Ta place t'attend au club",
    salutation,
    boutonLabel,
    corps: p.mineur
      ? [
          `Un dernier mot : la place de ${prenom} est prête au club.`,
          `Si vous voulez l'inscrire, c'est par ici. Nous ne vous écrirons plus ensuite.`,
        ]
      : [
          `Un dernier mot : ta place est prête au club.`,
          `Si tu veux nous rejoindre, c'est par ici. Nous ne t'écrirons plus ensuite.`,
        ],
  };
}
