import type { Adherent } from "./types";

// Notion de dossier "ENGAGÉ" : le 1er paiement est passé.
// - comptant payé                → statut_paiement = 'paye'
// - espèces confirmées (admin)   → statut_paiement = 'confirme_especes'
// - fractionné, 1re échéance OK   → echeances_payees >= 1 (statut reste 'en_attente')
//
// Module PUR (aucun import serveur) : utilisable côté client (admin + espace).
// engage_at stocke le MOMENT de l'engagement ; estEngage est le booléen dérivé
// des champs vivants (robuste, indépendant du backfill d'engage_at).
export function estEngage(
  a: Pick<Adherent, "statut_paiement" | "echeances_payees">,
): boolean {
  return (
    a.statut_paiement === "paye" ||
    a.statut_paiement === "confirme_especes" ||
    (a.echeances_payees ?? 0) >= 1
  );
}
