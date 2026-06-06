// ============================================================
// Helpers de formatage des champs de formulaire
// ============================================================

/**
 * Normalise un numéro de téléphone français vers 10 chiffres SANS espaces.
 * Gère +33 / 0033 / 33 en préfixe (→ 0). Conserve uniquement les chiffres.
 * Ex : "+33 7 60 83 98 30" → "0760839830"
 */
export function normalizePhone(input: string): string {
  let s = input.replace(/[^\d+]/g, ""); // chiffres et +
  if (s.startsWith("+33")) s = "0" + s.slice(3);
  else if (s.startsWith("0033")) s = "0" + s.slice(4);
  else if (s.startsWith("33") && s.length >= 11) s = "0" + s.slice(2);
  s = s.replace(/\D/g, ""); // chiffres uniquement
  return s.slice(0, 10);
}

/**
 * Formate des chiffres en "XX XX XX XX XX" (espace tous les 2 chiffres).
 * Ex : "0760839830" → "07 60 83 98 30"
 */
export function formatPhone(digits: string): string {
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

/** Garde uniquement les chiffres, max 5 (code postal FR). */
export function normalizePostal(input: string): string {
  return input.replace(/\D/g, "").slice(0, 5);
}
