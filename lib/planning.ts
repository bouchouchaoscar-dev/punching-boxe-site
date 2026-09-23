// ============================================================================
// MODULE PLANNING — types + helpers partagés (client & serveur).
// Module OPTIONNEL : activable par club via CONFIG_CLUB.modules.planning.actif.
// Données 100 % en base (profs / cours / affectations / periodes_fermeture) :
// aucun spécifique club en dur. Les occurrences d'une semaine sont générées À LA
// VOLÉE (jamais pré-générées en masse) à partir de la grille récurrente `cours`.
// ============================================================================
import { CONFIG_CLUB } from "./config-club";

/** Le module Planning est-il activé pour ce club ? (gate nav + routes). */
export function planningActif(): boolean {
  return CONFIG_CLUB.modules?.planning?.actif === true;
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
  package: string | null; // boxe_classique | savate_prepa | null (transverse)
  type_adherent: string | null; // adulte | jeune | null (tous)
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
