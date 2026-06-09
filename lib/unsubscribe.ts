import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "./constants";

// Désinscription marketing par token signé (HMAC), sans stockage de token.
// Le lien contient l'email + une signature ; impossible à forger sans le secret.
// Module SERVEUR uniquement (node:crypto).

function secret(): string {
  return (
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-unsubscribe-secret"
  );
}

// base64url (sûr pour une URL, sans =/+//).
function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

/** Email normalisé (minuscules, sans espaces) : la clé de désinscription. */
export function normaliserEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Signature HMAC de l'email normalisé. */
function signer(email: string): string {
  return b64url(
    createHmac("sha256", secret()).update(normaliserEmail(email)).digest(),
  );
}

/** Encode l'email pour l'URL (param `e`). */
export function encoderEmail(email: string): string {
  return b64url(normaliserEmail(email));
}

/** Décode le param `e` en email. */
export function decoderEmail(e: string): string {
  try {
    return normaliserEmail(fromB64url(e));
  } catch {
    return "";
  }
}

/** URL complète de désinscription pour un destinataire. */
export function unsubscribeUrl(email: string): string {
  return `${SITE_URL}/desinscription?e=${encoderEmail(email)}&t=${signer(email)}`;
}

/** Vérifie que le token `t` correspond bien à l'email `e` (constant-time). */
export function verifierToken(e: string, t: string): string | null {
  const email = decoderEmail(e);
  if (!email) return null;
  const attendu = signer(email);
  const a = Buffer.from(attendu);
  const b = Buffer.from(t || "");
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? email : null;
}
