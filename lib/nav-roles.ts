// Autorisations de navigation par rôle — SOURCE UNIQUE, sans dépendance
// (edge-safe : utilisé par le middleware, le login et les tests).

/** Pages autorisées à un coach : trombinoscope + planning (lecture seule) + login. */
export function coachAutorise(pathname: string): boolean {
  return (
    pathname === "/admin/login" ||
    pathname.startsWith("/admin/trombinoscope") ||
    pathname.startsWith("/admin/planning")
  );
}

/**
 * Une cible de redirection post-login est-elle sûre ET permise pour le rôle ?
 * - chemin INTERNE : commence par "/", pas "//", pas de backslash ;
 * - dans l'espace admin (/admin…) ;
 * - permise pour le rôle (coachAutorise pour un coach ; toute page /admin pour l'admin).
 * Sinon → false (l'appelant retombe sur la page par défaut du rôle).
 */
export function redirectionInterneValide(
  next: string | null | undefined,
  role: "admin" | "coach" | null,
): boolean {
  if (!next) return false;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return false;
  const path = next.split(/[?#]/)[0];
  if (!path.startsWith("/admin")) return false;
  return role === "coach" ? coachAutorise(path) : true;
}
