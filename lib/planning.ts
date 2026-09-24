// ============================================================================
// MODULE PLANNING — types + helpers partagés (client & serveur).
// Module OPTIONNEL : activable par club via CONFIG_CLUB.modules.planning.actif.
// Données 100 % en base (profs / cours / affectations / periodes_fermeture) :
// aucun spécifique club en dur. Les occurrences d'une semaine sont générées À LA
// VOLÉE (jamais pré-générées en masse) à partir de la grille récurrente `cours`.
// ============================================================================
import { CONFIG_CLUB } from "./config-club";
import { formuleLabel, type FormuleCle, type PackageType } from "./pricing";

/** Le module Planning est-il activé pour ce club ? (gate nav + routes). */
export function planningActif(): boolean {
  return CONFIG_CLUB.modules?.planning?.actif === true;
}

// Message du garde-fou de suppression (cours avec historique d'affectations).
export const MSG_HISTORIQUE_COURS =
  "Ce cours a un historique d'affectations. Désactivez-le plutôt pour le retirer du planning sans perdre l'historique.";

// Message du garde-fou de suppression d'un PROF ayant un historique de cours.
export const MSG_PROF_HISTORIQUE =
  "Ce prof a un historique de cours. Archivez-le plutôt : il ne sera plus proposé, mais ses heures restent.";

// Les 3 formules du club (SOURCE : pricing.formuleCle) déclinées pour un cours.
// Un cours porte package + avec_prepa (miroir adherents.option_prepa_physique) →
// en V2 « boxe_prepa » cible à la fois le segment boxe ET le segment prépa.
export const FORMULES_COURS: {
  cle: FormuleCle;
  label: string;
  package: PackageType;
  avecPrepa: boolean;
}[] = [
  { cle: "boxe", label: "Boxe française", package: "boxe_classique", avecPrepa: false },
  { cle: "boxe_prepa", label: "Boxe française + Prépa", package: "boxe_classique", avecPrepa: true },
  { cle: "savate_prepa", label: "Savate + Prépa", package: "savate_prepa", avecPrepa: false },
];

/** Décompose une clé de formule en (package, avec_prepa) pour l'écriture en base. */
export function formuleVersColonnes(cle: string): { package: PackageType; avecPrepa: boolean } | null {
  const f = FORMULES_COURS.find((x) => x.cle === cle);
  return f ? { package: f.package, avecPrepa: f.avecPrepa } : null;
}

// ---- DISCIPLINE d'un cours ([013]) -----------------------------------------
// Un cours enseigne UNE discipline (≠ formule d'adhésion). Le mailing « prévenir
// les adhérents » cible ensuite les formules qui incluent cette discipline.
export type DisciplineCours = "boxe_francaise" | "savate" | "prepa_physique";

export const DISCIPLINES_COURS: { cle: DisciplineCours; label: string }[] = [
  { cle: "boxe_francaise", label: "Boxe française" },
  { cle: "savate", label: "Savate" },
  { cle: "prepa_physique", label: "Préparation physique" },
];

export function disciplineLabel(d: string | null): string {
  return DISCIPLINES_COURS.find((x) => x.cle === d)?.label ?? "—";
}

/** Libellé du public d'un cours. type_adherent null = "Tous" (pas de distinction). */
export function publicLabel(t: string | null): string {
  if (t === "adulte") return "Adultes";
  if (t === "jeune") return "Jeunes";
  return "Tous";
}

// ---- Couleur d'un cours (discipline × public) — SOURCE UNIQUE ---------------
export type CouleurCours = { bg: string; bar: string };
const COULEUR_REPLI: CouleurCours = { bg: "#f5f5f5", bar: "#9ca3af" };

/**
 * Couleur d'un cours selon (discipline, public), lue depuis CONFIG_CLUB
 * (paramétrable par club). Priorité : surcharge du couple "discipline:public",
 * sinon couleur de la discipline, sinon repli neutre. Public "Tous" (null) →
 * couleur de la discipline. Utilisé partout où un cours est coloré (calendrier,
 * pastille de la liste, légende).
 */
export function couleurCours(discipline: string | null, publicType: string | null): CouleurCours {
  const conf = CONFIG_CLUB.modules?.planning?.couleurs;
  const disc = discipline ?? "";
  if (publicType && conf?.couples?.[`${disc}:${publicType}`]) {
    return conf.couples[`${disc}:${publicType}`];
  }
  return conf?.disciplines?.[disc] ?? COULEUR_REPLI;
}

/**
 * CIBLAGE MAILING — un adhérent (défini par sa FORMULE : package +
 * option_prepa_physique) est-il concerné par la discipline d'un cours ?
 * Recoupement clé : la prépa est incluse dans « Boxe française + Prépa »
 * (boxe_classique + option) ET dans « Savate + Prépa » (savate_prepa).
 */
export function adherentDansDiscipline(
  pkg: string | null,
  optionPrepa: boolean,
  discipline: string,
): boolean {
  switch (discipline) {
    case "boxe_francaise":
      return pkg === "boxe_classique"; // BF pures ET BF+Prépa (même package)
    case "savate":
      return pkg === "savate_prepa";
    case "prepa_physique":
      return (pkg === "boxe_classique" && optionPrepa === true) || pkg === "savate_prepa";
    default:
      return false;
  }
}

/** Clé de formule d'un cours à partir de ses colonnes (pour préremplir un select). */
export function coursFormuleCle(c: { package: string | null; avec_prepa?: boolean }): FormuleCle | null {
  if (c.package === "savate_prepa") return "savate_prepa";
  if (c.package === "boxe_classique") return c.avec_prepa ? "boxe_prepa" : "boxe";
  return null;
}

/** Libellé lisible de la formule d'un cours (réutilise le libellé pricing du club). */
export function coursFormuleLabel(c: { package: string | null; avec_prepa?: boolean }): string {
  if (!c.package) return "—";
  return formuleLabel(c.package as PackageType, !!c.avec_prepa);
}

// ---- Types (miroir des tables 011) ----------------------------------------
export type Prof = {
  id: string;
  actif: boolean;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  created_at?: string;
};

export type Cours = {
  id: string;
  actif: boolean;
  libelle: string | null;
  discipline: string | null; // [013] boxe_francaise | savate | prepa_physique (référence planning)
  package: string | null; // [héritage] formule d'adhésion — conservé, non utilisé
  avec_prepa: boolean; // [héritage 012] — conservé, non utilisé
  type_adherent: string | null; // adulte | jeune | null
  jour_semaine: number | null; // 1=lundi … 7=dimanche
  heure_debut: string | null; // "HH:MM[:SS]"
  heure_fin: string | null;
  salle: string | null;
  ville: string | null;
  created_at?: string;
};

export type Affectation = {
  id: string;
  cours_id: string;
  prof_id: string | null;
  semaine: string; // date ISO du lundi
  statut: "prevu" | "annule";
  created_at?: string;
};

export type PeriodeFermeture = {
  id: string;
  libelle: string | null;
  date_debut: string; // ISO
  date_fin: string; // ISO
  created_at?: string;
};

// ---- Jours ------------------------------------------------------------------
export const JOURS: { valeur: number; court: string; long: string }[] = [
  { valeur: 1, court: "Lun", long: "Lundi" },
  { valeur: 2, court: "Mar", long: "Mardi" },
  { valeur: 3, court: "Mer", long: "Mercredi" },
  { valeur: 4, court: "Jeu", long: "Jeudi" },
  { valeur: 5, court: "Ven", long: "Vendredi" },
  { valeur: 6, court: "Sam", long: "Samedi" },
  { valeur: 7, court: "Dim", long: "Dimanche" },
];

export function jourLong(valeur: number | null): string {
  return JOURS.find((j) => j.valeur === valeur)?.long ?? "—";
}

const pad2 = (n: number) => String(n).padStart(2, "0");
export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Lundi (00:00) de la semaine contenant `d`. Base de la clé `semaine`. */
export function lundiDeLaSemaine(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // 0=dim … 6=sam
  const delta = dow === 0 ? -6 : 1 - dow; // ramène au lundi
  x.setDate(x.getDate() + delta);
  return x;
}

/** Date du jour `jourSemaine` (1..7) dans la semaine du lundi `lundiISO`. */
export function dateDuJour(lundiISO: string, jourSemaine: number): Date {
  const [y, m, d] = lundiISO.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  base.setDate(base.getDate() + (jourSemaine - 1));
  return base;
}

/** "HH:MM" à partir d'un champ time Postgres ("HH:MM" ou "HH:MM:SS"). */
export function formatHeure(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}

// ---- Formulation partagée (mails profs ET adhérents) — SOURCE UNIQUE ---------
/** "18h" pour une heure pleine, "18h30" sinon. À partir de "HH:MM[:SS]". */
export function heureFr(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
/** Plage : "de 18h à 19h30". */
export function plageHoraire(debut: string | null, fin: string | null): string {
  const a = heureFr(debut);
  const b = heureFr(fin);
  if (a && b) return `de ${a} à ${b}`;
  return a || b || "";
}
/** "mardi 29 septembre" (+ année si différente de l'année de référence). */
export function formatDateCours(iso: string, ref: Date = new Date()): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  const jour = dt.toLocaleDateString("fr-FR", { weekday: "long" });
  const mois = dt.toLocaleDateString("fr-FR", { month: "long" });
  const num = d === 1 ? "1er" : String(d);
  let s = `${jour} ${num} ${mois}`;
  if (dt.getFullYear() !== ref.getFullYear()) s += ` ${dt.getFullYear()}`;
  return s;
}
/** Minuscule sans accents (dédoublonnage lieu / choix de préposition). */
function normaliserLieu(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
/**
 * "Gymnase du Port (Nogent)". Ville vide → salle seule. Salle contenant déjà la
 * ville (insensible casse/accents) → pas de doublon. Salle vide → ville seule.
 */
export function formatLieu(salle?: string | null, ville?: string | null): string {
  const s = (salle || "").trim();
  const v = (ville || "").trim();
  if (!s && !v) return "";
  if (!s) return v;
  if (!v) return s;
  if (normaliserLieu(s).includes(normaliserLieu(v))) return s;
  return `${s} (${v})`;
}
// Table de prépositions GÉNÉRIQUE (paramétrable, aucun nom de club en dur).
const PREPO_AU = ["gymnase", "dojo", "stade", "complexe", "centre", "parc", "palais", "club"];
const PREPO_ALA = ["salle", "maison", "piscine", "halle", "base"];
/**
 * Lieu avec préposition selon le 1er mot du nom de salle. Mot non reconnu →
 * { texte: null } : l'appelant met le lieu sur une ligne séparée "Lieu : …".
 */
export function lieuAvecPreposition(salle?: string | null, ville?: string | null): { texte: string | null; connue: boolean } {
  const s = (salle || "").trim();
  const v = (ville || "").trim();
  const lieu = formatLieu(s, v);
  if (!lieu) return { texte: "", connue: true };
  if (!s) return { texte: `à ${v}`, connue: true }; // ville seule
  const premier = normaliserLieu(s.split(/\s+/)[0] || "");
  if (PREPO_AU.includes(premier)) return { texte: `au ${lieu}`, connue: true };
  if (PREPO_ALA.includes(premier)) return { texte: `à la ${lieu}`, connue: true };
  if (/^[aeiouy]/.test(premier) || /^h/.test(premier)) return { texte: `à l'${lieu}`, connue: true };
  return { texte: null, connue: false };
}

/** Durée formatée unique pour l'affichage des heures profs : "21h" / "21h30". */
export function formatDureeHeures(h: number): string {
  const total = Math.round(h * 60);
  const heures = Math.floor(total / 60);
  const min = total % 60;
  return min ? `${heures}h${String(min).padStart(2, "0")}` : `${heures}h`;
}

/** Durée d'un cours en heures décimales (pour d'éventuelles stats V2). */
export function dureeHeures(debut: string | null, fin: string | null): number {
  if (!debut || !fin) return 0;
  const [h1, m1] = debut.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  const mins = h2 * 60 + m2 - (h1 * 60 + m1);
  return mins > 0 ? mins / 60 : 0;
}

/** Un jour ISO tombe-t-il dans une période de fermeture (bornes incluses) ? */
export function estFerme(dateISO: string, periodes: PeriodeFermeture[]): PeriodeFermeture | null {
  for (const p of periodes) {
    if (dateISO >= p.date_debut && dateISO <= p.date_fin) return p;
  }
  return null;
}

// ---- Envoi de planning aux profs : snapshot + diff (PUR, testable) ----------
export type CoursEnvoi = {
  cours_id: string;
  jour: number; // 1..7
  date: string; // ISO de l'occurrence
  horaire: string; // "18:00 – 19:30"
  libelle: string;
  salle: string | null;
  ville: string | null;
};

/** Planning d'un prof pour une semaine : ses cours affectés, hors jours fermés, trié. */
export function planningProfSemaine(
  profId: string,
  cours: Cours[],
  affectations: { cours_id: string; prof_id: string | null }[],
  semaineISO: string,
  periodes: PeriodeFermeture[],
): CoursEnvoi[] {
  const coursIds = new Set(affectations.filter((a) => a.prof_id === profId).map((a) => a.cours_id));
  const items: CoursEnvoi[] = [];
  for (const c of cours) {
    if (!coursIds.has(c.id) || !c.jour_semaine) continue;
    const dISO = toISODate(dateDuJour(semaineISO, c.jour_semaine));
    if (estFerme(dISO, periodes)) continue; // jour fermé → hors planning
    items.push({
      cours_id: c.id,
      jour: c.jour_semaine,
      date: dISO,
      horaire: `${formatHeure(c.heure_debut)} – ${formatHeure(c.heure_fin)}`,
      libelle: c.libelle ?? "Cours",
      salle: c.salle,
      ville: c.ville,
    });
  }
  items.sort((a, b) => a.jour - b.jour || a.horaire.localeCompare(b.horaire));
  return items;
}

/** Clé de comparaison : ce qui, s'il change, justifie un (re)envoi. */
export function cleEnvoi(c: CoursEnvoi): string {
  return [c.cours_id, c.jour, c.horaire, c.salle ?? "", c.ville ?? ""].join("|");
}

// ---- Reprise des profs de la semaine passée (PUR, testable) ----------------
/** Une semaine (lundi) est-elle entièrement fermée ? (tous ses jours fermés) */
export function semaineFermee(lundiISO: string, periodes: PeriodeFermeture[]): boolean {
  return JOURS.every((j) => estFerme(toISODate(dateDuJour(lundiISO, j.valeur)), periodes));
}
export function reculerSemaine(lundiISO: string, semaines: number): string {
  const [y, m, d] = lundiISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 7 * semaines);
  return toISODate(dt);
}
/** Source de reprise : S-1, ou la dernière semaine ouverte si S-1 est fermée. */
export function choisirSourceReprise(
  semaineCible: string,
  periodes: PeriodeFermeture[],
  maxRecul = 8,
): { source: string; sourceFermee: boolean } {
  const s1 = reculerSemaine(semaineCible, 1);
  if (!semaineFermee(s1, periodes)) return { source: s1, sourceFermee: false };
  for (let k = 2; k <= maxRecul; k++) {
    const s = reculerSemaine(semaineCible, k);
    if (!semaineFermee(s, periodes)) return { source: s, sourceFermee: true };
  }
  return { source: s1, sourceFermee: true };
}
/**
 * Décide quelles affectations de la source recopier sur la cible. Ignore :
 * cours introuvable/désactivé, jour fermé sur la cible, ou déjà affecté (cible).
 */
export function calculerReprise(
  semaineCible: string,
  cours: Cours[],
  affSource: { cours_id: string; prof_id: string | null }[],
  affCible: { cours_id: string; prof_id: string | null }[],
  periodes: PeriodeFermeture[],
  profsActifsIds?: Set<string>, // si fourni : les profs ARCHIVÉS ne sont pas repris
): { aInserer: { cours_id: string; prof_id: string; semaine: string; statut: "prevu" }[]; reprises: number; ignorees: number } {
  const coursById = new Map(cours.map((c) => [c.id, c]));
  const deja = new Set(affCible.filter((a) => a.prof_id).map((a) => `${a.cours_id}:${a.prof_id}`));
  const aInserer: { cours_id: string; prof_id: string; semaine: string; statut: "prevu" }[] = [];
  let ignorees = 0;
  for (const a of affSource) {
    if (!a.prof_id) {
      ignorees++;
      continue;
    }
    const c = coursById.get(a.cours_id);
    const jourFerme = c?.jour_semaine
      ? !!estFerme(toISODate(dateDuJour(semaineCible, c.jour_semaine)), periodes)
      : false;
    const profArchive = profsActifsIds ? !profsActifsIds.has(a.prof_id) : false;
    if (!c || !c.actif || jourFerme || profArchive || deja.has(`${a.cours_id}:${a.prof_id}`)) {
      ignorees++;
      continue;
    }
    aInserer.push({ cours_id: a.cours_id, prof_id: a.prof_id, semaine: semaineCible, statut: "prevu" });
    deja.add(`${a.cours_id}:${a.prof_id}`);
  }
  return { aInserer, reprises: aInserer.length, ignorees };
}

/** Une affectation sur `semaineISO` est-elle « historique » (passée/en cours) ? */
export function estHistoriqueSemaine(semaineISO: string, lundiCourantISO: string): boolean {
  return semaineISO <= lundiCourantISO;
}

/** Suppression d'un prof autorisée ? (libre si pas d'historique, sinon confirmation requise) */
export function suppressionProfAutorisee(historique: number, confirmer: boolean): boolean {
  return historique === 0 || confirmer === true;
}

/** Résumé des changements pour l'objet du mail : "1 cours ajouté, 1 retiré, 1 modifié". */
export function libelleChangements(nAjoutes: number, nRetires: number, nModifies: number): string {
  const segs: { n: number; mot: string }[] = [];
  if (nAjoutes) segs.push({ n: nAjoutes, mot: "ajouté" });
  if (nRetires) segs.push({ n: nRetires, mot: "retiré" });
  if (nModifies) segs.push({ n: nModifies, mot: "modifié" });
  return segs.map((s, i) => `${s.n}${i === 0 ? " cours" : ""} ${s.mot}${s.n > 1 ? "s" : ""}`).join(", ");
}

// ---- Mails « prévenir les adhérents » (PUR, testable) -----------------------
// (Mineur/majeur : réutiliser `estMineur` de lib/pricing — seuil CONFIG_CLUB.)

/** Prochaine occurrence non fermée d'un cours (même jour) après `apresSemaineISO`. */
export function prochaineOccurrence(
  jourSemaine: number | null,
  apresSemaineISO: string,
  periodes: PeriodeFermeture[],
  maxSemaines = 6,
): string | null {
  if (!jourSemaine) return null;
  for (let k = 1; k <= maxSemaines; k++) {
    const lundi = reculerSemaine(apresSemaineISO, -k); // -k = +k semaines
    const iso = toISODate(dateDuJour(lundi, jourSemaine));
    if (!estFerme(iso, periodes)) return iso;
  }
  return null;
}

type CreneauMail = { dateISO: string; heure_debut: string | null; heure_fin: string | null; salle: string | null; ville: string | null };

/**
 * Gabarit du mail « prévenir les adhérents » (annulé / déplacé / reporté).
 * Rappelle TOUJOURS le cours d'origine complet, puis ce qui change. Contient les
 * jetons {{salutation}} et {{concerne}} (résolus à l'envoi selon majeur/mineur/foyer).
 */
export function genererMailPrevenir(p: {
  libelle: string;
  motif: "annule" | "deplace" | "reporte";
  origine: CreneauMail;
  nouveau?: CreneauMail;
  raison?: string;
  prochainISO?: string | null;
  clubNom: string;
}): { objet: string; contenu: string } {
  const o = p.origine;
  const origDateFr = formatDateCours(o.dateISO);
  const origPlage = plageHoraire(o.heure_debut, o.heure_fin);
  const origPrep = lieuAvecPreposition(o.salle, o.ville);
  const lieuInline = origPrep.connue && origPrep.texte ? ` ${origPrep.texte}` : "";
  const lieuSepare = !origPrep.connue && formatLieu(o.salle, o.ville) ? `\nLieu : ${formatLieu(o.salle, o.ville)}` : "";

  const n = p.nouveau;
  const horaireChange = !!n && (n.heure_debut !== o.heure_debut || n.heure_fin !== o.heure_fin);
  const lieuChange = !!n && formatLieu(n.salle, n.ville) !== formatLieu(o.salle, o.ville);
  const nvPlage = n ? plageHoraire(n.heure_debut, n.heure_fin) : "";
  const nvPrep = n ? lieuAvecPreposition(n.salle, n.ville) : { texte: null, connue: true };
  const nvLieuTxt = n ? (nvPrep.connue && nvPrep.texte ? nvPrep.texte : formatLieu(n.salle, n.ville)) : "";

  let corps = "";
  let suffixe = "";
  if (p.motif === "annule") {
    let ph = `Le cours ${p.libelle} du ${origDateFr}, prévu ${origPlage}${lieuInline}, est annulé`;
    if (p.raison && p.raison.trim()) ph += ` pour la raison suivante : ${p.raison.trim()}`;
    corps = `${ph}.${lieuSepare}`;
    if (p.prochainISO) corps += `\n\nProchain cours : ${formatDateCours(p.prochainISO)}, ${origPlage}${lieuInline}.`;
    suffixe = "annulé";
  } else if (p.motif === "deplace") {
    corps = `Le cours ${p.libelle} du ${origDateFr}, prévu ${origPlage}${lieuInline}, est déplacé.${lieuSepare}`;
    if (horaireChange && lieuChange) corps += `\n\nIl aura lieu ${nvPlage}, ${nvLieuTxt}.`;
    else if (horaireChange) corps += `\n\nIl aura lieu ${nvPlage}, au même endroit.`;
    else if (lieuChange) corps += `\n\nIl aura lieu aux mêmes horaires, ${nvLieuTxt}.`;
    suffixe = horaireChange ? `déplacé à ${heureFr(n?.heure_debut ?? null)}` : "changement de lieu";
  } else {
    const nd = n?.dateISO ?? o.dateISO;
    const lieuPart = lieuChange ? `, ${nvLieuTxt}` : ", au même endroit";
    corps = `Le cours ${p.libelle} du ${origDateFr}, prévu ${origPlage}${lieuInline}, est reporté au ${formatDateCours(nd)}, ${nvPlage}${lieuPart}.${lieuSepare}`;
    suffixe = `reporté au ${formatDateCours(nd)}`;
  }

  return {
    objet: `📅 Cours ${p.libelle} du ${origDateFr} : ${suffixe}`,
    contenu: `{{salutation}}\n\n{{concerne}}${corps}\n\nMerci de votre compréhension.\n\nSportivement,\nL'équipe ${p.clubNom}`,
  };
}

// ---- Stats d'heures par prof (PUR, testable) — source unique ----------------
export type OccurrenceProf = {
  prof_id: string;
  date: string; // ISO de l'occurrence
  jour: number;
  heure_debut: string | null;
  heure_fin: string | null;
  libelle: string;
  discipline: string | null;
  dureeH: number; // heures décimales
  realise: boolean; // occurrence passée (date+fin ≤ maintenant)
};
export type StatProf = {
  prof_id: string;
  nom: string; // "Prénom Nom"
  actif: boolean;
  nbRealises: number;
  heuresRealisees: number;
  nbPrevus: number;
  heuresPrevues: number;
  occurrences: OccurrenceProf[];
};

/**
 * Heures par prof sur une période [debutISO, finISO] (bornes sur la DATE de
 * l'occurrence). Une affectation = une occurrence à sa date ; durée = fin−début ;
 * chaque prof compte la durée entière (multi-profs) ; jours fermés exclus ; les
 * cours désactivés comptent quand même leurs occurrences passées (historique).
 * « Réalisé » = date+heure_fin ≤ maintenant ; sinon « prévu ».
 */
export function calculerHeuresProfs(params: {
  cours: Cours[];
  affectations: { cours_id: string; prof_id: string | null; semaine: string }[];
  profs: Prof[];
  periodes: PeriodeFermeture[];
  debutISO: string;
  finISO: string;
  now?: Date;
}): { parProf: StatProf[]; totalHeuresRealisees: number; totalHeuresPrevues: number; totalRealises: number; totalPrevus: number } {
  const now = params.now ?? new Date();
  const coursById = new Map(params.cours.map((c) => [c.id, c]));
  const profById = new Map(params.profs.map((p) => [p.id, p]));
  const acc = new Map<string, StatProf>();

  for (const a of params.affectations) {
    if (!a.prof_id) continue;
    const c = coursById.get(a.cours_id);
    if (!c || !c.jour_semaine) continue;
    const dISO = toISODate(dateDuJour(a.semaine, c.jour_semaine));
    if (dISO < params.debutISO || dISO > params.finISO) continue; // hors période
    if (estFerme(dISO, params.periodes)) continue; // jour fermé
    const dureeH = dureeHeures(c.heure_debut, c.heure_fin);

    // Réalisé si la fin de l'occurrence est passée (minuit=00 valide, pas 59).
    const [Y, M, D] = dISO.split("-").map(Number);
    let finOcc: Date;
    if (c.heure_fin) {
      const [hf, mf] = c.heure_fin.split(":").map(Number);
      finOcc = new Date(Y, M - 1, D, hf, mf || 0);
    } else {
      finOcc = new Date(Y, M - 1, D, 23, 59);
    }
    const realise = finOcc.getTime() <= now.getTime();

    const p = profById.get(a.prof_id);
    let st = acc.get(a.prof_id);
    if (!st) {
      st = {
        prof_id: a.prof_id,
        nom: p ? [p.prenom, p.nom].filter(Boolean).join(" ").trim() || "Prof" : "Prof supprimé",
        actif: p ? p.actif : false,
        nbRealises: 0,
        heuresRealisees: 0,
        nbPrevus: 0,
        heuresPrevues: 0,
        occurrences: [],
      };
      acc.set(a.prof_id, st);
    }
    st.occurrences.push({
      prof_id: a.prof_id,
      date: dISO,
      jour: c.jour_semaine,
      heure_debut: c.heure_debut,
      heure_fin: c.heure_fin,
      libelle: c.libelle ?? "Cours",
      discipline: c.discipline,
      dureeH,
      realise,
    });
    if (realise) {
      st.nbRealises++;
      st.heuresRealisees += dureeH;
    } else {
      st.nbPrevus++;
      st.heuresPrevues += dureeH;
    }
  }

  const parProf = [...acc.values()];
  for (const st of parProf) {
    st.occurrences.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.heure_debut ?? "").localeCompare(b.heure_debut ?? "")));
    st.heuresRealisees = Math.round(st.heuresRealisees * 100) / 100;
    st.heuresPrevues = Math.round(st.heuresPrevues * 100) / 100;
  }
  parProf.sort((a, b) => a.nom.localeCompare(b.nom));

  return {
    parProf,
    totalHeuresRealisees: Math.round(parProf.reduce((s, p) => s + p.heuresRealisees, 0) * 100) / 100,
    totalHeuresPrevues: Math.round(parProf.reduce((s, p) => s + p.heuresPrevues, 0) * 100) / 100,
    totalRealises: parProf.reduce((s, p) => s + p.nbRealises, 0),
    totalPrevus: parProf.reduce((s, p) => s + p.nbPrevus, 0),
  };
}

export type StatutEnvoi = "nouveau" | "maj" | "plus_de_cours" | "identique" | "rien";

/**
 * Diff du planning d'un prof vs son dernier snapshot envoyé.
 * - jamais envoyé + cours → "nouveau" ; jamais envoyé + aucun cours → "rien"
 * - identique → "identique" (aucun mail)
 * - devenu vide → "plus_de_cours" (avec la liste retirée)
 * - sinon → "maj" (avec la liste retirée éventuelle)
 */
export function diffEnvoiPlanning(
  actuel: CoursEnvoi[],
  precedent: CoursEnvoi[] | null,
): { statut: StatutEnvoi; retires: CoursEnvoi[] } {
  const clesA = new Set(actuel.map(cleEnvoi));
  if (!precedent) return { statut: actuel.length > 0 ? "nouveau" : "rien", retires: [] };
  const clesP = new Set(precedent.map(cleEnvoi));
  const identique = clesA.size === clesP.size && [...clesA].every((k) => clesP.has(k));
  const retires = precedent.filter((c) => !clesA.has(cleEnvoi(c)));
  if (identique) return { statut: "identique", retires: [] };
  if (actuel.length === 0) return { statut: "plus_de_cours", retires };
  return { statut: "maj", retires };
}

export type DiffDetaille = {
  statut: StatutEnvoi;
  ajoutes: CoursEnvoi[];
  retires: CoursEnvoi[];
  modifies: { avant: CoursEnvoi; apres: CoursEnvoi }[];
};

/**
 * Diff DÉTAILLÉ par cours_id (pour le mail « mise à jour ») :
 * - ajouté : cours présent maintenant, absent du dernier envoi ;
 * - retiré : cours présent au dernier envoi, absent maintenant ;
 * - modifié : même cours_id mais horaire/salle/ville/jour différents (via cleEnvoi).
 */
export function diffEnvoiDetaille(actuel: CoursEnvoi[], precedent: CoursEnvoi[] | null): DiffDetaille {
  if (!precedent) return { statut: actuel.length > 0 ? "nouveau" : "rien", ajoutes: [], retires: [], modifies: [] };
  const precById = new Map(precedent.map((c) => [c.cours_id, c]));
  const actById = new Map(actuel.map((c) => [c.cours_id, c]));
  const ajoutes: CoursEnvoi[] = [];
  const modifies: { avant: CoursEnvoi; apres: CoursEnvoi }[] = [];
  for (const c of actuel) {
    const p = precById.get(c.cours_id);
    if (!p) ajoutes.push(c);
    else if (cleEnvoi(p) !== cleEnvoi(c)) modifies.push({ avant: p, apres: c });
  }
  const retires = precedent.filter((c) => !actById.has(c.cours_id));
  const rien = ajoutes.length === 0 && retires.length === 0 && modifies.length === 0;
  const statut: StatutEnvoi = rien ? "identique" : actuel.length === 0 ? "plus_de_cours" : "maj";
  return { statut, ajoutes, retires, modifies };
}
