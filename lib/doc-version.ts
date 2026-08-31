// Versioning d'URL de document storage pour contourner le cache HTTP.
//
// Les PDF (fiche, règlement) sont servis avec `cache-control: max-age=3600` et
// réécrits au MÊME chemin lors d'une re-signature → le navigateur/CDN sert une
// version périmée tant que le cache n'a pas expiré. En ajoutant `?v=<signee_at>`,
// l'URL change à chaque re-signature → cache-miss garanti sur la nouvelle
// version, tout en gardant le cache entre deux versions. Doc jamais signé
// (version absente) → URL inchangée (rétrocompat).
export function urlAvecVersion(
  url: string | null | undefined,
  version: string | null | undefined,
): string | null {
  if (!url) return url ?? null;
  if (!version) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${encodeURIComponent(version)}`;
}
