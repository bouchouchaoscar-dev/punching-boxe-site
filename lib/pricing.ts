// ============================================================
// Logique tarifaire — Punching Boxe
// Source : BRIEF.md
// ============================================================

export type TypeAdherent = "adulte" | "jeune";

// Deux formules au choix.
export type PackageType = "boxe_classique" | "savate_prepa";

export const TARIFS = {
  adhesion: 30, // 1ère année uniquement (nouveau membre)
  prepaPhysique: 70,
  // La cotisation dépend désormais de la formule.
  cotisation: {
    boxe_classique: { adulte: 430, jeune: 410 },
    savate_prepa: { adulte: 350, jeune: 330 },
  } as Record<PackageType, { adulte: number; jeune: number }>,
} as const;

export const PACKAGE_LABEL: Record<PackageType, string> = {
  boxe_classique: "Package Boxe Française",
  savate_prepa: "Package Savate et Prépa",
};

/**
 * Libellé d'affichage de la formule, incluant l'option prépa quand elle est
 * prise (Boxe Française). Source UNIQUE pour l'espace adhérent, la fiche/liste
 * admin et les emails. Ex. "Boxe Française + accès Préparation physique et Savate".
 */
export function formuleLabel(
  p?: PackageType | null,
  optionPrepa?: boolean,
): string {
  if (!p) return "—";
  if (p === "savate_prepa") return "Savate et Prépa";
  return optionPrepa
    ? "Boxe Française + accès Préparation physique et Savate"
    : "Boxe Française";
}

export type PricingInput = {
  dateNaissance?: string; // ISO yyyy-mm-dd — sert à déduire le type
  typeAdherent?: TypeAdherent; // override possible
  packageType: PackageType;
  nouveauMembre: boolean;
  optionPrepaPhysique: boolean; // ne s'applique (et n'est facturé) que pour Boxe Française
  nbMembresFamille: number; // nombre de membres DÉJÀ inscrits dans la famille
};

export type PricingLine = { label: string; amount: number; muted?: boolean };

export type PricingResult = {
  typeAdherent: TypeAdherent;
  packageType: PackageType;
  cotisationBase: number; // cotisation PLEIN tarif (début de saison), avant remise
  mois: MoisPalier; // palier du mois d'inscription
  cotisationProratisee: number; // cotisation du mois (lue dans la table), avant remise
  remisePct: number;
  remiseMontant: number;
  cotisationNette: number; // proratisée − remise famille
  adhesion: number;
  prepa: number;
  total: number;
  lines: PricingLine[];
};

// ── Dégressivité par PALIERS FIXES (tables validées client) ──────────────
// On ne calcule plus un prorata ÷10 : le montant de la cotisation ET de l'option
// prépa sont LUS dans une table selon le mois d'inscription.

export type MoisPalier =
  | "sept" | "oct" | "nov" | "dec" | "jan"
  | "fev" | "mars" | "avr" | "mai" | "juin";

// Cotisation FIXE par mois d'inscription. Sept/oct/nov = plein tarif → on
// référence TARIFS.cotisation (source unique : changer le plein met à jour ces 3).
export const COTISATION_PALIERS: Record<
  MoisPalier,
  Record<PackageType, { adulte: number; jeune: number }>
> = {
  sept: TARIFS.cotisation,
  oct: TARIFS.cotisation,
  nov: TARIFS.cotisation,
  dec: { boxe_classique: { adulte: 375, jeune: 355 }, savate_prepa: { adulte: 305, jeune: 285 } },
  jan: { boxe_classique: { adulte: 320, jeune: 300 }, savate_prepa: { adulte: 260, jeune: 240 } },
  fev: { boxe_classique: { adulte: 265, jeune: 250 }, savate_prepa: { adulte: 215, jeune: 200 } },
  mars: { boxe_classique: { adulte: 210, jeune: 200 }, savate_prepa: { adulte: 170, jeune: 160 } },
  avr: { boxe_classique: { adulte: 155, jeune: 150 }, savate_prepa: { adulte: 125, jeune: 120 } },
  mai: { boxe_classique: { adulte: 100, jeune: 95 }, savate_prepa: { adulte: 80, jeune: 75 } },
  juin: { boxe_classique: { adulte: 50, jeune: 50 }, savate_prepa: { adulte: 50, jeune: 50 } },
};

// Option prépa (Boxe Française uniquement) — DÉGRESSIVE selon le mois.
// Sept→Fév = plein (TARIFS.prepaPhysique) ; mars/avr/mai = 35 ; juin = 10.
export const PREPA_PALIERS: Record<MoisPalier, number> = {
  sept: TARIFS.prepaPhysique,
  oct: TARIFS.prepaPhysique,
  nov: TARIFS.prepaPhysique,
  dec: TARIFS.prepaPhysique,
  jan: TARIFS.prepaPhysique,
  fev: TARIFS.prepaPhysique,
  mars: 35,
  avr: 35,
  mai: 35,
  juin: 10,
};

/**
 * Mois d'inscription → palier de la table.
 * - sept→mai : palier du mois calendaire.
 * - juin : plancher ("juin") si "saison en cours" (bascule), sinon plein ("sept")
 *   car c'est une inscription anticipée pour la saison à venir.
 * - juil/août : plein ("sept"), saison à venir.
 */
export function moisPalier(date: Date, saisonEnCours = false): MoisPalier {
  const m = date.getMonth();
  if (m === 5) return saisonEnCours ? "juin" : "sept";
  switch (m) {
    case 8: return "sept";
    case 9: return "oct";
    case 10: return "nov";
    case 11: return "dec";
    case 0: return "jan";
    case 1: return "fev";
    case 2: return "mars";
    case 3: return "avr";
    case 4: return "mai";
    default: return "sept"; // juillet, août : saison à venir, plein
  }
}

/** Montant de l'option prépa (Boxe Française) selon le mois d'inscription. */
export function prepaDuMois(date: Date, saisonEnCours = false): number {
  return PREPA_PALIERS[moisPalier(date, saisonEnCours)];
}

// Seuils d'âge (révolus). DYNAMIQUES : calculés par rapport à une date de
// référence, jamais figés sur une année → se décalent automatiquement chaque
// saison. Les deux seuils sont INDÉPENDANTS : un 13-17 ans = tarif adulte MAIS
// mineur (autorisation parentale requise).
export const SEUIL_JEUNE_ANS = 13; // < 13 ans = tarif « jeune »
export const SEUIL_MAJORITE_ANS = 18; // < 18 ans = mineur (autorisation parentale)

/** Âge révolu à une date de référence (anniversaire de l'année pris en compte). */
function ageRevolu(dateNaissance: string, ref: Date): number | null {
  const d = new Date(dateNaissance);
  if (Number.isNaN(d.getTime())) return null;
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
  return age;
}

/**
 * Type tarifaire : « jeune » = moins de 13 ans à la date de référence (la date
 * d'inscription par défaut). DYNAMIQUE : le seuil suit la saison, rien n'est
 * figé sur une année.
 */
export function deduireType(
  dateNaissance?: string,
  ref: Date = new Date(),
): TypeAdherent {
  if (!dateNaissance) return "adulte";
  const age = ageRevolu(dateNaissance, ref);
  if (age == null) return "adulte";
  return age < SEUIL_JEUNE_ANS ? "jeune" : "adulte";
}

/**
 * Mineur = moins de 18 ans à la date de référence. INDÉPENDANT du seuil tarif :
 * un adhérent de 13 à 17 ans paie le tarif adulte mais reste mineur (et requiert
 * donc l'autorisation parentale). DYNAMIQUE.
 */
export function estMineur(
  dateNaissance?: string,
  ref: Date = new Date(),
): boolean {
  if (!dateNaissance) return false;
  const age = ageRevolu(dateNaissance, ref);
  return age != null && age < SEUIL_MAJORITE_ANS;
}

/**
 * Réduction famille : s'applique UNIQUEMENT sur la cotisation, et
 * uniquement à partir du 3ème membre de la famille.
 * nbMembresFamille = nombre de membres déjà inscrits.
 * → nouvel inscrit = rang (nbMembresFamille + 1).
 */
export function remiseFamillePct(nbMembresFamille: number): number {
  const rang = nbMembresFamille + 1;
  if (rang >= 5) return 20;
  if (rang === 4) return 15;
  if (rang === 3) return 10;
  return 0;
}

export function calculerTarif(
  input: PricingInput,
  date: Date,
  saisonEnCours = false,
): PricingResult {
  const typeAdherent: TypeAdherent =
    input.typeAdherent ?? deduireType(input.dateNaissance, date);

  const cotisationBase = TARIFS.cotisation[input.packageType][typeAdherent];

  // 1) Cotisation LUE dans la table de paliers selon le mois d'inscription.
  const mois = moisPalier(date, saisonEnCours);
  const cotisationProratisee =
    COTISATION_PALIERS[mois][input.packageType][typeAdherent];

  // 2) Remise famille sur la cotisation du mois (inchangé : 3e -10%, etc.).
  const remisePct = remiseFamillePct(input.nbMembresFamille || 0);
  const remiseMontant = Math.round((cotisationProratisee * remisePct) / 100);
  const cotisationNette = cotisationProratisee - remiseMontant;

  const adhesion = input.nouveauMembre ? TARIFS.adhesion : 0;

  // Option prépa : Boxe Française uniquement, DÉGRESSIVE selon le mois (table).
  // Incluse (0€) dans Savate & Prépa. Fractionnée avec la cotisation (cf. tarifs.ts).
  const prepa =
    input.packageType === "boxe_classique" && input.optionPrepaPhysique
      ? PREPA_PALIERS[mois]
      : 0;

  const total = cotisationNette + adhesion + prepa;

  const lines: PricingLine[] = [
    {
      label: `${PACKAGE_LABEL[input.packageType]} (${typeAdherent === "jeune" ? "Jeune" : "Adulte"})`,
      amount: cotisationProratisee,
    },
  ];
  if (remiseMontant > 0) {
    lines.push({
      label: `Réduction famille -${remisePct}% (sur cotisation)`,
      amount: -remiseMontant,
    });
  }
  if (adhesion > 0) {
    lines.push({ label: "Adhésion au club (1ère année)", amount: adhesion });
  }
  if (prepa > 0) {
    lines.push({ label: "Préparation physique et savate", amount: prepa });
  }
  if (input.packageType === "savate_prepa") {
    lines.push({
      label: "Savate Fitness + Préparation Physique inclus",
      amount: 0,
      muted: true,
    });
  }

  return {
    typeAdherent,
    packageType: input.packageType,
    cotisationBase,
    mois,
    cotisationProratisee,
    remisePct,
    remiseMontant,
    cotisationNette,
    adhesion,
    prepa,
    total,
    lines,
  };
}

export type ModePaiement =
  | "stripe_1x"
  | "stripe_2x"
  | "stripe_3x"
  | "stripe_4x"
  | "especes";

export function nbEcheances(mode: ModePaiement): number {
  switch (mode) {
    case "stripe_2x":
      return 2;
    case "stripe_3x":
      return 3;
    case "stripe_4x":
      return 4;
    default:
      return 1;
  }
}

/** Montant par échéance, en euros, arrondi proprement (le 1er paiement absorbe le reste). */
export function montantParEcheance(total: number, n: number): number {
  return Math.round((total / n) * 100) / 100;
}

export const euro = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
