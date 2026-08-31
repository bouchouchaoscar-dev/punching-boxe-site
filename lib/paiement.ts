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
