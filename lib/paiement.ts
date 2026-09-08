import type { Adherent } from "./types";
import type { ModePaiement } from "./pricing";

// Payé (pastille VERTE) = mêmes états que le vert de StatutBadge/PaiementStatut :
// paiement soldé (carte payée / fractionné N/N → statut_paiement passe à "paye")
// ou espèces confirmées. Tout le reste (en attente, engagé partiel, échec) = orange.
// Source unique du booléen "payé" pour le trombinoscope (vue + PDF).
export function estPaiementSolde(a: Pick<Adherent, "statut_paiement">): boolean {
  return (
    a.statut_paiement === "paye" || a.statut_paiement === "confirme_especes"
  );
}

// Libellé COURT du mode de paiement (stripe* → "Carte"). Préparé pour usage
// éventuel ; la vignette essentielle n'affiche pas le mode.
export function modeLabelCourt(mode: ModePaiement): string {
  return mode === "especes" ? "Espèces" : "Carte";
}

// ---- Statut PRÉCIS pour le trombinoscope (source unique vue + PDF) ----
// Un fractionné qui avance normalement est VERT (sain). Seul un vrai échec de
// prélèvement (statut_paiement = 'echec_paiement', posé par le cron/confirm)
// est ROUGE. L'attente espèces (non encore encaissée) est ORANGE.
export type TrombiStatutCode =
  | "paye_carte"
  | "paye_especes"
  | "fractionne" // carte fractionnée en cours (sain)
  | "attente_especes"
  | "echec";

export type TrombiStatut = {
  code: TrombiStatutCode;
  couleur: "vert" | "orange" | "rouge";
  label: string;
};

export function statutTrombi(
  a: Pick<
    Adherent,
    "statut_paiement" | "mode_paiement" | "nb_echeances" | "echeances_payees"
  >,
): TrombiStatut {
  const nb = a.nb_echeances || 1;
  const payees = a.echeances_payees || 0;

  // 🔴 Échec de prélèvement (détecté et enregistré).
  if (a.statut_paiement === "echec_paiement") {
    return {
      code: "echec",
      couleur: "rouge",
      label: nb > 1 ? `Prélèvement échoué ${payees}/${nb}` : "Paiement échoué",
    };
  }

  // 🟢 Soldé (carte 1x, fractionné terminé, ou espèces confirmées).
  if (estPaiementSolde(a)) {
    const especes =
      a.statut_paiement === "confirme_especes" || a.mode_paiement === "especes";
    return especes
      ? { code: "paye_especes", couleur: "vert", label: "Payé — espèces" }
      : { code: "paye_carte", couleur: "vert", label: "Payé — carte" };
  }

  // 🟠 Espèces pas encore encaissées.
  if (a.mode_paiement === "especes") {
    return {
      code: "attente_especes",
      couleur: "orange",
      label: "Espèces — en attente",
    };
  }

  // 🟢 Carte fractionnée en cours (déroulement normal) → avancement.
  return {
    code: "fractionne",
    couleur: "vert",
    label: nb > 1 ? `Carte ${payees}/${nb}` : "Carte — en cours",
  };
}
