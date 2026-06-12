import type { Adherent } from "./types";
import { estEngage } from "./engagement";

// ============================================================
// Définition CENTRALE et UNIQUE de "adhérent actif compté".
// Réutilisée par : segments de mailing, KPI dashboard, décompte foyer.
// ------------------------------------------------------------
// Actif = NON fermé (annule_at) ET :
//   - engagé / payé / espèces confirmées (estEngage), OU
//   - inscription ESPÈCES finalisée en attente de confirmation admin.
// Exclut donc : dossiers fermés (annule_at) et paniers ABANDONNÉS
// (dossier carte resté en_attente sans engagement).
// ============================================================
export function estActifCompte(
  a: Pick<
    Adherent,
    "statut_paiement" | "echeances_payees" | "mode_paiement" | "annule_at"
  >,
): boolean {
  if (a.annule_at) return false;
  if (estEngage(a)) return true;
  return a.mode_paiement === "especes" && a.statut_paiement === "en_attente";
}
