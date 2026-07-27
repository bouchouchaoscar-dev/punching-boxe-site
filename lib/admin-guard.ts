/** Vérifie qu'une requête API provient de l'admin (Bearer = mot de passe admin). */
export function isAdminRequest(request: Request): boolean {
  // FAIL CLOSED : pas de secret configuré → refus (jamais de fallback en dur).
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === expected;
}
