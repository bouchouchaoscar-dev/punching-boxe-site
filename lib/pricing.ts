// ============================================================
// Logique tarifaire — Punching Boxe
// Source : BRIEF.md
// ============================================================

export const TARIFS = {
  adhesion: 30, // 1ère année uniquement (nouveau membre)
  cotisationAdulte: 430,
  cotisationJeune: 410,
  prepaPhysique: 100,
} as const;

export type TypeAdherent = "adulte" | "jeune";

// Deux formules au choix.
export type PackageType = "boxe_classique" | "savate_forme";

export const PACKAGE_LABEL: Record<PackageType, string> = {
  boxe_classique: "Package Boxe Classique",
  savate_forme: "Package Savate & Forme",
};

export type PricingInput = {
  dateNaissance?: string; // ISO yyyy-mm-dd — sert à déduire le type
  typeAdherent?: TypeAdherent; // override possible
  packageType: PackageType;
  nouveauMembre: boolean;
  optionPrepaPhysique: boolean; // ne s'applique (et n'est facturé) que pour Boxe Classique
  nbMembresFamille: number; // nombre de membres DÉJÀ inscrits dans la famille
};

export type PricingLine = { label: string; amount: number; muted?: boolean };

export type PricingResult = {
  typeAdherent: TypeAdherent;
  packageType: PackageType;
  cotisationBase: number;
  remisePct: number;
  remiseMontant: number;
  adhesion: number;
  prepa: number;
  total: number;
  lines: PricingLine[];
};

/**
 * Un « jeune » est né après le 01/01/2013 (moins de 13 ans à la création
 * de la grille). On déduit le type depuis la date de naissance si fournie.
 */
export function deduireType(dateNaissance?: string): TypeAdherent {
  if (!dateNaissance) return "adulte";
  const d = new Date(dateNaissance);
  if (Number.isNaN(d.getTime())) return "adulte";
  const seuil = new Date("2013-01-01");
  return d > seuil ? "jeune" : "adulte";
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

export function calculerTarif(input: PricingInput): PricingResult {
  const typeAdherent: TypeAdherent =
    input.typeAdherent ?? deduireType(input.dateNaissance);

  const cotisationBase =
    typeAdherent === "jeune"
      ? TARIFS.cotisationJeune
      : TARIFS.cotisationAdulte;

  const remisePct = remiseFamillePct(input.nbMembresFamille || 0);
  const remiseMontant = Math.round((cotisationBase * remisePct) / 100);
  const cotisationNette = cotisationBase - remiseMontant;

  const adhesion = input.nouveauMembre ? TARIFS.adhesion : 0;

  // La Préparation Physique n'est facturée (+100€) que dans le package
  // Boxe Classique. Dans Savate & Forme, elle est incluse (0€).
  const prepa =
    input.packageType === "boxe_classique" && input.optionPrepaPhysique
      ? TARIFS.prepaPhysique
      : 0;

  const total = cotisationNette + adhesion + prepa;

  const lines: PricingLine[] = [
    {
      label: `${PACKAGE_LABEL[input.packageType]} (${typeAdherent === "jeune" ? "Jeune" : "Adulte"})`,
      amount: cotisationBase,
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
    lines.push({ label: "Option Préparation Physique", amount: prepa });
  }
  if (input.packageType === "savate_forme") {
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
    remisePct,
    remiseMontant,
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
