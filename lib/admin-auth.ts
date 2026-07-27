// Auth admin minimaliste — un seul compte, piloté UNIQUEMENT par variables
// d'environnement. AUCUN identifiant ni mot de passe EN DUR : si les variables
// ne sont pas posées, l'accès est REFUSÉ (fail closed). Session en localStorage.
// (Outil interne, pas de RLS.)

// Identifiant (username, PAS un email). Vide si non configuré → login impossible.
export const ADMIN_USERNAME = process.env.NEXT_PUBLIC_ADMIN_USERNAME ?? "";

export const ADMIN_SESSION_KEY = "pbnp_admin_session";
export const ADMIN_TOKEN_KEY = "pbnp_admin_token";

export function isAdminLogged(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ADMIN_SESSION_KEY) === "ok";
}

export function setAdminSession(ok: boolean) {
  if (typeof window === "undefined") return;
  if (ok) window.localStorage.setItem(ADMIN_SESSION_KEY, "ok");
  else {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
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
