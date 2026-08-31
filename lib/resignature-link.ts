import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "./constants";

// Lien de re-signature scopé, signé HMAC, SANS stockage (calqué sur unsubscribe.ts).
// La charge signée = adherentId + docs + expiration → impossible à forger ou à
// réutiliser au-delà de l'échéance sans le secret. Module SERVEUR uniquement.
//
// FAIL-CLOSED : aucun secret de repli en dur. Si RESIGN_SECRET est absent (ou
// trop court), la génération LÈVE et la vérification REJETTE — jamais d'ouverture
// par défaut.

export type ResignDoc = "fiche" | "reglement";

// Durée de validité du lien.
export const RESIGN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function requireSecret(): string {
  const s = process.env.RESIGN_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "RESIGN_SECRET absent ou trop court : re-signature désactivée (fail-closed).",
    );
  }
  return s;
}

function b64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Liste de docs canonique (dédoublonnée, filtrée, triée) : "fiche,reglement". */
function canonicalDocs(docs: ResignDoc[]): string {
  return [...new Set(docs)]
    .filter((d): d is ResignDoc => d === "fiche" || d === "reglement")
    .sort()
    .join(",");
}

/** Signature HMAC de la charge `adherentId.docs.exp`. Lève si secret absent. */
function sign(adherentId: string, docs: string, exp: number): string {
  const payload = `${adherentId}.${docs}.${exp}`;
  return b64url(createHmac("sha256", requireSecret()).update(payload).digest());
}

/**
 * Construit l'URL de re-signature signée. LÈVE si RESIGN_SECRET est absent
 * (l'appelant doit alors échouer proprement, cf. endpoint 503).
 */
export function buildResignatureUrl(
  adherentId: string,
  docs: ResignDoc[],
  now: number = Date.now(),
): string {
  const doc = canonicalDocs(docs);
  const exp = now + RESIGN_TTL_MS;
  const t = sign(adherentId, doc, exp);
  const qs = new URLSearchParams({ a: adherentId, doc, exp: String(exp), t });
  return `${SITE_URL}/re-signer?${qs.toString()}`;
}

/**
 * Vérifie un lien de re-signature (HMAC valide ET non expiré, en temps constant).
 * Renvoie { adherentId, docs } si OK, sinon null. Fail-closed : toute erreur
 * (dont secret absent) → null. Utilisé aux lots 3/4.
 */
export function verifyResignatureToken(
  a: string,
  doc: string,
  exp: string,
  t: string,
): { adherentId: string; docs: ResignDoc[] } | null {
  try {
    if (!a || !doc || !exp || !t) return null;
    const expNum = Number(exp);
    if (!Number.isFinite(expNum) || expNum < Date.now()) return null; // expiré/invalide
    const attendu = sign(a, doc, expNum);
    const ab = Buffer.from(attendu);
    const bb = Buffer.from(t);
    if (ab.length !== bb.length) return null;
    if (!timingSafeEqual(ab, bb)) return null;
    const docs = doc
      .split(",")
      .filter((d): d is ResignDoc => d === "fiche" || d === "reglement");
    if (docs.length === 0) return null;
    return { adherentId: a, docs };
  } catch {
    return null; // secret absent ou toute autre erreur → rejet
  }
}
