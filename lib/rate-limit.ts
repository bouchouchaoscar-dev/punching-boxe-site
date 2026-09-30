// Limitation de débit simple en mémoire (par IP + clé). Suffisant pour un
// vestiaire (≈ 50 personnes en même temps) ; best-effort en serverless (chaque
// instance a sa propre fenêtre). Aucune dépendance externe.
type Bucket = { count: number; reset: number };
const store = new Map<string, Bucket>();

/** true si la requête est AUTORISÉE ; false si le quota est dépassé. */
export function autoriser(cle: string, limite: number, fenetreMs: number): boolean {
  const now = Date.now();
  const b = store.get(cle);
  if (!b || now > b.reset) {
    store.set(cle, { count: 1, reset: now + fenetreMs });
    return true;
  }
  if (b.count >= limite) return false;
  b.count++;
  return true;
}

/** IP client best-effort (x-forwarded-for en tête, sinon "local"). */
export function ipDe(request: Request): string {
  const xff = request.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
}
