// ============================================================
// Logique tarifaire proratisée + échéances adaptatives (Stripe)
// La saison sportive va de septembre (mois 1) à juin (mois 10).
// ============================================================

import { calculerTarif, type PackageType } from "./pricing";

export const MOIS_SAISON_TOTAL = 10;

/**
 * Date de fin de saison (30 juin) pour la saison concernée par `date`.
 * Juin → décembre : inscription pour la SAISON À VENIR (se termine le 30 juin
 * de l'année suivante). Janvier → mai : saison en cours (30 juin même année).
 */
export function finSaison(date: Date): Date {
  const y = date.getFullYear();
  const endYear = date.getMonth() >= 5 ? y + 1 : y; // juin(5)→déc → année suivante
  return new Date(endYear, 5, 30);
}

/** Mois réellement restants jusqu'à la fin de saison (sert au choix des échéances). */
export function moisRestantsReels(date: Date): number {
  const fin = finSaison(date);
  return (
    (fin.getFullYear() - date.getFullYear()) * 12 +
    (fin.getMonth() - date.getMonth())
  );
}

/**
 * Inscription proratisée ? UNIQUEMENT de janvier à mai.
 * Juin → décembre = tarif PLEIN (saison à venir). Juin n'est jamais proratisé.
 */
export function estProratise(date: Date): boolean {
  const m = date.getMonth();
  return m >= 0 && m <= 4; // janvier(0) … mai(4)
}

// Mois "bonus" facturés en cas de proratisation, par mois calendaire (janv→mai).
const BONUS_PAR_MOIS_CAL: Record<number, number> = {
  0: 7, // janvier
  1: 6, // février
  2: 5, // mars
  3: 4, // avril
  4: 3, // mai
};

/** Cotisation due : pleine (juin→déc) ou proratisée (janv→mai). */
export function cotisationProratisee(
  cotisationAnnuelle: number,
  date: Date,
): number {
  if (!estProratise(date)) return cotisationAnnuelle;
  const bonus = BONUS_PAR_MOIS_CAL[date.getMonth()] ?? MOIS_SAISON_TOTAL;
  const mensuel = cotisationAnnuelle / MOIS_SAISON_TOTAL;
  return Math.round(bonus * mensuel);
}

/** Nombre d'échéances autorisées selon les mois restants. */
export function echeancesAutorisees(date: Date): number[] {
  const reels = moisRestantsReels(date);
  if (reels >= 4) return [1, 2, 3, 4];
  if (reels === 3) return [1, 2, 3];
  return [1];
}

/** Indicateur informatif du mois de saison (1 = sept … 10 = juin ; 0 hors saison). */
export function moisSaison(date: Date): number {
  const m = date.getMonth();
  if (m >= 8) return m - 7; // sept(8)→1 … déc(11)→4
  if (m <= 5) return m + 5; // janv(0)→5 … juin(5)→10
  return 0; // juillet, août
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Dates des échéances, étalées de la date d'inscription jusqu'à fin juin. */
export function datesEcheances(date: Date, n: number): string[] {
  if (n <= 1) return [toISO(date)];
  const fin = finSaison(date);
  const jours = Math.max(1, Math.round((fin.getTime() - date.getTime()) / 86400000));
  const interval = Math.floor(jours / n);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + interval * i);
    out.push(toISO(d));
  }
  return out;
}

/**
 * Répartit un montant en n parts égales au centime près.
 * La 1ère part absorbe le reste d'arrondi → la somme est STRICTEMENT égale
 * au montant fourni.
 */
export function repartirCotisation(montant: number, n: number): number[] {
  if (n <= 1) return [round2(montant)];
  const base = Math.floor((montant / n) * 100) / 100;
  const arr = Array.from({ length: n }, () => base);
  const reste = round2(montant - base * n);
  arr[0] = round2(arr[0] + reste);
  return arr;
}

export type PlanEcheances = {
  n: number;
  dates: string[]; // ISO yyyy-mm-dd, une par échéance
  montants: number[]; // (cotisation proratisée + prépa) répartie en n parts
  adhesion: number; // adhésion, payée EN ENTIER sur le 1er prélèvement (non fractionnée)
  premierPrelevement: number; // montants[0] + adhesion
};

/**
 * Plan complet d'échéances.
 * On fractionne TOUT sauf l'adhésion : `fractionnable` = cotisation proratisée
 * + prépa physique. L'adhésion (30€) est ajoutée en entier au 1er prélèvement.
 */
export function planEcheances(
  fractionnable: number,
  adhesion: number,
  date: Date,
  n: number,
): PlanEcheances {
  const dates = datesEcheances(date, n);
  const montants = repartirCotisation(fractionnable, n);
  return {
    n,
    dates,
    montants,
    adhesion,
    premierPrelevement: round2(montants[0] + adhesion),
  };
}

export type DevisInscription = {
  cotisation: number; // cotisation proratisée nette (après remise famille)
  adhesion: number; // adhésion (30€ 1ère année, sinon 0) — NON fractionnée
  prepa: number; // option prépa physique (100€ ou 0) — fractionnée
  supplements: number; // adhésion + prépa (récap prix)
  fractionnable: number; // cotisation + prépa = montant réparti sur les échéances
  total: number;
  proratise: boolean;
  moisSaison: number;
  echeancesAutorisees: number[];
};

/** Champs adhérent nécessaires au calcul du devis. */
export type DevisInput = {
  date_naissance: string;
  package: PackageType;
  nouveau_membre: boolean;
  option_prepa_physique: boolean;
  nb_membres_famille: number;
};

/** Devis (montant + options) pour un adhérent, à une date d'inscription donnée. */
export function devisPourAdherent(a: DevisInput, dateInscription: Date): DevisInscription {
  const t = calculerTarif({
    dateNaissance: a.date_naissance,
    packageType: a.package,
    nouveauMembre: a.nouveau_membre,
    optionPrepaPhysique: a.option_prepa_physique,
    nbMembresFamille: a.nb_membres_famille,
  });
  const cotisationNette = t.cotisationBase - t.remiseMontant;
  const cotisation = cotisationProratisee(cotisationNette, dateInscription);
  const adhesion = t.adhesion;
  const prepa = t.prepa;
  const supplements = adhesion + prepa;
  // Tout est fractionné SAUF l'adhésion : cotisation proratisée + prépa physique.
  const fractionnable = cotisation + prepa;
  return {
    cotisation,
    adhesion,
    prepa,
    supplements,
    fractionnable,
    total: cotisation + supplements,
    proratise: estProratise(dateInscription),
    moisSaison: moisSaison(dateInscription),
    echeancesAutorisees: echeancesAutorisees(dateInscription),
  };
}

/** Libellé court d'une date ISO en français (ex : « 12 mars 2026 »). */
export function formatDateFr(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
