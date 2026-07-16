// ============================================================
// Logique tarifaire proratisée + échéances adaptatives (Stripe)
// La saison sportive va de septembre (mois 1) à juin (mois 10).
// ============================================================

import { calculerTarif, type PackageType } from "./pricing";

/**
 * Date de fin (30 juin) de la SAISON VISÉE par `date`.
 * - janv → mai : saison en cours (30 juin même année)
 * - juin → déc : saison à venir (30 juin année suivante)
 * - juin + bascule "saison en cours" : la saison qui se termine ce 30 juin.
 */
export function finSaison(date: Date, saisonEnCours = false): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  let endYear: number;
  if (saisonEnCours && m === 5)
    endYear = y; // juin + bascule : saison qui se termine ce 30 juin
  else endYear = m >= 5 ? y + 1 : y; // juin→déc → année suivante
  return new Date(endYear, 5, 30);
}

/** Mois restants jusqu'au 30 juin de la saison visée (sert au choix des échéances). */
export function moisRestantsReels(date: Date, saisonEnCours = false): number {
  const fin = finSaison(date, saisonEnCours);
  return (
    (fin.getFullYear() - date.getFullYear()) * 12 +
    (fin.getMonth() - date.getMonth())
  );
}

/**
 * Nombre d'échéances autorisées selon les mois restants jusqu'à la fin de la
 * saison visée. Comptant (1) toujours disponible.
 */
export function echeancesAutorisees(date: Date, saisonEnCours = false): number[] {
  const reels = moisRestantsReels(date, saisonEnCours);
  if (reels >= 5) return [1, 2, 3, 4];
  if (reels >= 3) return [1, 2]; // 4 ou 3 mois → comptant + 2x
  return [1]; // 2 mois ou moins → comptant
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

/**
 * Dates des échéances sur MOIS CONSÉCUTIFS depuis l'inscription :
 * mois 0 (immédiat) + mois+1 + … + mois+(n-1). Le jour est clampé au dernier
 * jour du mois cible (31 janv +1 → 28 févr). Filet : aucune échéance après le
 * 30 juin de la saison visée.
 */
export function datesEcheances(date: Date, n: number): string[] {
  if (n <= 1) return [toISO(date)];
  const fin = finSaison(date);
  const day = date.getDate();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const y = date.getFullYear();
    const m = date.getMonth() + i;
    const dernierJour = new Date(y, m + 1, 0).getDate(); // dernier jour du mois cible
    let d = new Date(y, m, Math.min(day, dernierJour));
    if (d.getTime() > fin.getTime()) d = fin; // filet : jamais après le 30 juin
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
  montants: number[]; // cotisation proratisée (+ option) répartie en n parts
  adhesion: number; // part non fractionnée (adhésion/licence), payée EN ENTIER sur le 1er prélèvement
  premierPrelevement: number; // montants[0] + adhesion
};

/**
 * Plan complet d'échéances.
 * On fractionne TOUT sauf la part non fractionnable (adhésion/licence) :
 * `fractionnable` = cotisation proratisée (+ option). L'adhésion est ajoutée en
 * entier au 1er prélèvement.
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
  adhesion: number; // adhésion 1ère année (ou 0) — NON fractionnée
  prepa: number; // option supplémentaire du club (0 si aucune) — fractionnée
  supplements: number; // adhésion + option (récap prix)
  fractionnable: number; // cotisation + option = montant réparti sur les échéances
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

/**
 * Devis (montant + options) pour un adhérent, à une date d'inscription donnée.
 * Source de vérité unique : calculerTarif (prorata → remise famille).
 */
export function devisPourAdherent(
  a: DevisInput,
  dateInscription: Date,
  saisonEnCours = false,
): DevisInscription {
  const t = calculerTarif(
    {
      dateNaissance: a.date_naissance,
      packageType: a.package,
      nouveauMembre: a.nouveau_membre,
      optionPrepaPhysique: a.option_prepa_physique,
      nbMembresFamille: a.nb_membres_famille,
    },
    dateInscription,
    saisonEnCours,
  );
  const adhesion = t.adhesion;
  const prepa = t.prepa;
  const supplements = adhesion + prepa;
  // Tout est fractionné SAUF l'adhésion : cotisation (proratisée + remise) + option.
  const fractionnable = t.cotisationNette + prepa;
  return {
    cotisation: t.cotisationNette,
    adhesion,
    prepa,
    supplements,
    fractionnable,
    total: t.total,
    proratise: t.cotisationProratisee < t.cotisationBase,
    moisSaison: moisSaison(dateInscription),
    echeancesAutorisees: echeancesAutorisees(dateInscription, saisonEnCours),
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
