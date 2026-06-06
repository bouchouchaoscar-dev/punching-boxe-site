import { ADMIN_PASSWORD_FALLBACK } from "./admin-auth";

/** Vérifie qu'une requête API provient de l'admin (Bearer = mot de passe admin). */
export function isAdminRequest(request: Request): boolean {
  const expected = process.env.ADMIN_PASSWORD || ADMIN_PASSWORD_FALLBACK;
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === expected;
}
