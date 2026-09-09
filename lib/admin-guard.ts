import crypto from "crypto";

// Rôles reconnus. `admin` = accès complet ; `coach` = lecture seule du
// trombinoscope (voir /api/coach/*). Évolutif : la SOURCE du rôle pourra
// devenir une table + token signé sans changer les appelants (qui demandent
// une capacité via hasRole / isAdminRequest, jamais un mot de passe précis).
export type Role = "admin" | "coach";

// Comparaison à temps constant, tolérante aux longueurs différentes (évite un
// oracle de timing). Renvoie false si l'une des chaînes est vide.
function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function bearer(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  return auth.replace(/^Bearer\s+/i, "").trim();
}

// Résout le rôle d'une requête à partir du Bearer (= mot de passe partagé).
// FAIL CLOSED : pas de secret configuré → aucun rôle. Jamais de fallback en dur.
export function resolveRole(request: Request): Role | null {
  const token = bearer(request);
  if (!token) return null;
  const adminPw = process.env.ADMIN_PASSWORD;
  const coachPw = process.env.COACH_PASSWORD;
  if (adminPw && safeEqual(token, adminPw)) return "admin";
  if (coachPw && safeEqual(token, coachPw)) return "coach";
  return null;
}

// La requête possède-t-elle l'un des rôles attendus ?
export function hasRole(request: Request, roles: Role[]): boolean {
  const r = resolveRole(request);
  return r !== null && roles.includes(r);
}

/** Vérifie qu'une requête API provient de l'admin (rôle admin uniquement). */
export function isAdminRequest(request: Request): boolean {
  return resolveRole(request) === "admin";
}
