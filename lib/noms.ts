// Formatage d'AFFICHAGE des noms/prénoms (jamais en base, jamais à la saisie).
// Source unique réutilisée par les vues, les PDF et les mails.

/**
 * Prénom : première lettre de chaque mot en majuscule (séparateurs = espace ET
 * tiret), le reste en minuscule. Accents/trémas gérés (locale fr).
 * "jean-marc" → "Jean-Marc" · "marie  claire" → "Marie Claire".
 */
export function formaterPrenom(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr")
    .replace(/[^\s-]+/g, (mot) =>
      mot.charAt(0).toLocaleUpperCase("fr") + mot.slice(1),
    );
}

/** Nom : tout en majuscules. "pierre-schlösser" → "PIERRE-SCHLÖSSER". */
export function formaterNom(s: string | null | undefined): string {
  if (!s) return "";
  return s.trim().replace(/\s+/g, " ").toLocaleUpperCase("fr");
}

/** "Jean-Marc AFONSO". */
export function formaterNomComplet(
  prenom: string | null | undefined,
  nom: string | null | undefined,
): string {
  return `${formaterPrenom(prenom)} ${formaterNom(nom)}`.trim();
}
