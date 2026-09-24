// Validation du format d'une adresse email — SOURCE UNIQUE (inscription,
// création/modification adhérent, espace adhérent, profs, exclusion à l'envoi).
// Règle : local@domaine.tld, ASCII uniquement (rejette accents et espaces),
// insensible à la casse. On normalise (trim + minuscules) avant de tester.

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** Normalise une adresse : trim + minuscules (forme stockée/comparée). */
export function normaliserEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** true si l'adresse a un format valide (local@domaine.tld, sans espace/accent). */
export function estEmailValide(email: string | null | undefined): boolean {
  const e = normaliserEmail(email);
  if (!e || e.length > 254) return false;
  return EMAIL_RE.test(e);
}

export const MESSAGE_EMAIL_INVALIDE = "Adresse email invalide";
