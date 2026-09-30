// URL absolue canonique du site — SOURCE UNIQUE pour le module Présence
// (QR des affiches, liens des mails de relance). Lit UNIQUEMENT
// NEXT_PUBLIC_SITE_URL : jamais VERCEL_URL ni l'en-tête host de la requête, pour
// ne pas encoder une URL de déploiement dans un QR imprimé. Fail-closed : null si
// la variable est absente (l'appelant décide d'échouer proprement).
export function siteUrl(): string | null {
  const u = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  return u || null;
}

/** URL absolue de la page de pointage (avec slug de salle optionnel). null si
 *  NEXT_PUBLIC_SITE_URL absente. */
export function urlPresence(slug?: string | null): string | null {
  const base = siteUrl();
  if (!base) return null;
  return slug ? `${base}/presence?salle=${encodeURIComponent(slug)}` : `${base}/presence`;
}
