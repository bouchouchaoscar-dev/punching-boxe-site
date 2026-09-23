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
  package: string | null; // boxe_classique | savate_prepa | null
  avec_prepa: boolean; // [012] Boxe + Prépa (miroir adherents.option_prepa_physique)
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
