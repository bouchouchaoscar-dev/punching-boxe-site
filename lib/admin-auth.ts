// Auth admin minimaliste — un seul compte (Pascal), codé en dur,
// surchargabe par variables d'environnement. Session en localStorage.
// (Modèle validé sur Beach Paddle : outil interne, pas de RLS.)

// Identifiant (username, PAS un email) — surchargé par env.
export const ADMIN_USERNAME =
  process.env.NEXT_PUBLIC_ADMIN_USERNAME || "Pascal";

// Mot de passe par défaut — À CHANGER via env ADMIN_PASSWORD en prod.
export const ADMIN_PASSWORD_FALLBACK = "Punchingboxe94";

export const ADMIN_SESSION_KEY = "pbnp_admin_session";

export function isAdminLogged(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ADMIN_SESSION_KEY) === "ok";
}

export function setAdminSession(ok: boolean) {
  if (typeof window === "undefined") return;
  if (ok) window.localStorage.setItem(ADMIN_SESSION_KEY, "ok");
  else window.localStorage.removeItem(ADMIN_SESSION_KEY);
}
