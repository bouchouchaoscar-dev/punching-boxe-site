// Classe un code d'échec Stripe (decline_code, à défaut code) en 3 familles qui
// pilotent le parcours : message adhérent, libellé admin, mail, bouton retry.
// Module PUR (aucun import serveur) → utilisable côté client (synthèse, fiche).

export type FamilleEchec = "provision" | "carte_morte" | "autre";

// Carte bonne, refus ponctuel pour solde insuffisant : on retente la même carte.
const PROVISION = new Set<string>(["insufficient_funds"]);

// Carte plus utilisable : l'adhérent doit saisir une nouvelle carte (self-service).
// `authentication_required` : un prélèvement off-session ne peut pas faire de 3DS,
// l'adhérent doit repasser en direct → on le traite comme une nouvelle saisie.
const CARTE_MORTE = new Set<string>([
  "expired_card",
  "lost_card",
  "stolen_card",
  "pickup_card",
  "card_not_supported",
  "restricted_card",
  "invalid_account",
  "no_such_issuer",
  "revocation_of_authorization",
  "authentication_required",
]);

/** Range un code Stripe dans une famille. null/inconnu → "autre" (fallback prudent). */
export function familleEchec(code: string | null | undefined): FamilleEchec {
  if (!code) return "autre";
  const c = code.toLowerCase();
  if (PROVISION.has(c)) return "provision";
  if (CARTE_MORTE.has(c)) return "carte_morte";
  return "autre";
}

// Libellés FR courts pour l'admin (le club voit la cause, pas juste "échec").
const LIBELLES: Record<string, string> = {
  insufficient_funds: "fonds insuffisants",
  expired_card: "carte expirée",
  lost_card: "carte perdue",
  stolen_card: "carte volée",
  pickup_card: "carte bloquée",
  card_not_supported: "carte non supportée",
  restricted_card: "carte restreinte",
  invalid_account: "compte invalide",
  no_such_issuer: "banque inconnue",
  revocation_of_authorization: "autorisation révoquée",
  authentication_required: "authentification requise",
};

/** Texte court de la cause pour la fiche admin (ex. "fonds insuffisants"). */
export function libelleEchecAdmin(code: string | null | undefined): string {
  if (code) {
    const l = LIBELLES[code.toLowerCase()];
    if (l) return l;
  }
  switch (familleEchec(code)) {
    case "provision":
      return "fonds insuffisants";
    case "carte_morte":
      return "carte invalide";
    default:
      return "refus bancaire";
  }
}
