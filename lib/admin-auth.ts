// Auth admin minimaliste — un seul compte, piloté UNIQUEMENT par variables
// d'environnement. AUCUN identifiant ni mot de passe EN DUR : si les variables
// ne sont pas posées, l'accès est REFUSÉ (fail closed). Session en localStorage.
// (Outil interne, pas de RLS.)

// Identifiant (username, PAS un email). Vide si non configuré → login impossible.
export const ADMIN_USERNAME = process.env.NEXT_PUBLIC_ADMIN_USERNAME ?? "";
// Identifiant coach (lecture seule trombinoscope). Vide → login coach impossible.
export const COACH_USERNAME = process.env.NEXT_PUBLIC_COACH_USERNAME ?? "";

export const ADMIN_SESSION_KEY = "pbnp_admin_session";
export const ADMIN_TOKEN_KEY = "pbnp_admin_token";
export const ADMIN_ROLE_KEY = "pbnp_admin_role";
// Cookie de rôle NON SECRET, lu par le middleware (edge) pour le gating des
// pages. Ce n'est PAS une preuve d'auth : l'enforcement réel reste par endpoint
// (le Bearer ≠ mot de passe admin → 401). Un coach qui trafique ce cookie
// n'obtient aucune donnée admin.
export const ROLE_COOKIE = "pbnp_role";

export type Role = "admin" | "coach";

export function isAdminLogged(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ADMIN_SESSION_KEY) === "ok";
}

export function getAdminRole(): Role | null {
  if (typeof window === "undefined") return null;
  const r = window.localStorage.getItem(ADMIN_ROLE_KEY);
  return r === "admin" || r === "coach" ? r : null;
}

export function setAdminRole(role: Role) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADMIN_ROLE_KEY, role);
  // Cookie non-secret pour le middleware (SameSite=Lax, Secure).
  document.cookie = `${ROLE_COOKIE}=${role}; path=/; max-age=2592000; samesite=lax; secure`;
}

export function setAdminSession(ok: boolean) {
  if (typeof window === "undefined") return;
  if (ok) window.localStorage.setItem(ADMIN_SESSION_KEY, "ok");
  else {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    window.localStorage.removeItem(ADMIN_ROLE_KEY);
    // Expire le cookie de rôle.
    document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0; samesite=lax; secure`;
  }
}

/** Jeton d'auth pour les routes API admin (= mot de passe admin). */
export function setAdminToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
}
export function getAdminToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
}

/** En-têtes d'authentification pour fetch vers une route API admin. */
export function adminAuthHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getAdminToken()}` };
}
