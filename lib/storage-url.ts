import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";

// SOURCE UNIQUE de la signature des fichiers du bucket adherents-documents
// (photos + documents). Objectif sécurité : bucket privé → tout accès passe par
// une URL signée temporaire, jamais une URL publique. Fail-closed : en cas
// d'erreur, on renvoie null (aucun repli vers une URL publique).

// TTL des URLs signées (1 h). Les vues sont rechargées régulièrement → une URL
// fraîche est regénérée à chaque chargement serveur.
export const SIGNED_URL_TTL = 3600;

/**
 * Extrait le CHEMIN objet (`{uuid}/photo.jpg`) depuis, au choix :
 *  - une URL publique  …/object/public/adherents-documents/{chemin}
 *  - une URL signée    …/object/sign/adherents-documents/{chemin}?token=…
 *  - un chemin nu déjà stocké ({uuid}/photo.jpg)
 * Le token/query est retiré. Rétrocompatible : les URLs publiques déjà en base
 * restent lisibles (on en extrait le chemin) → aucune migration de données.
 */
export function cheminDepuisUrl(urlOuChemin?: string | null): string | null {
  if (!urlOuChemin) return null;
  const v = urlOuChemin.trim();
  if (!v) return null;

  const markers = [
    `/object/public/${STORAGE_BUCKET}/`,
    `/object/sign/${STORAGE_BUCKET}/`,
    `/${STORAGE_BUCKET}/`,
  ];
  for (const marker of markers) {
    const i = v.indexOf(marker);
    if (i !== -1) {
      const chemin = v.slice(i + marker.length).split("?")[0];
      return chemin ? decodeURIComponent(chemin) : null;
    }
  }
  // Chemin nu (ni URL http, ni marqueur bucket) → tel quel (query retirée).
  if (!/^https?:\/\//i.test(v)) return v.split("?")[0] || null;
  return null; // URL externe inconnue → non signable
}

/** URL signée d'UN chemin. Renvoie null si chemin absent ou erreur (fail-closed). */
export async function signer(
  chemin: string | null,
  ttl: number = SIGNED_URL_TTL,
): Promise<string | null> {
  if (!chemin) return null;
  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(STORAGE_BUCKET)
      .createSignedUrl(chemin, ttl);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * URLs signées de PLUSIEURS chemins, en UN appel batch, alignées sur l'ordre
 * d'entrée (les entrées null restent null). Fail-closed (null en cas d'erreur).
 */
export async function signerPlusieurs(
  chemins: (string | null)[],
  ttl: number = SIGNED_URL_TTL,
): Promise<(string | null)[]> {
  const valides = chemins.filter((c): c is string => !!c);
  if (!valides.length) return chemins.map(() => null);
  try {
    const { data } = await getSupabaseAdmin()
      .storage.from(STORAGE_BUCKET)
      .createSignedUrls(valides, ttl);
    // Réponse alignée sur l'ordre des chemins demandés → zip par index.
    const map = new Map<string, string | null>();
    valides.forEach((p, i) => map.set(p, data?.[i]?.signedUrl ?? null));
    return chemins.map((c) => (c ? (map.get(c) ?? null) : null));
  } catch {
    return chemins.map(() => null);
  }
}

/** Confort : signe directement une URL (publique/signée) ou un chemin. */
export const signerUrl = (
  urlOuChemin?: string | null,
  ttl: number = SIGNED_URL_TTL,
): Promise<string | null> => signer(cheminDepuisUrl(urlOuChemin ?? null), ttl);

/** Confort : signe une liste d'URLs/chemins (batch), alignée sur l'entrée. */
export const signerUrls = (
  liste: (string | null | undefined)[],
  ttl: number = SIGNED_URL_TTL,
): Promise<(string | null)[]> =>
  signerPlusieurs(
    liste.map((u) => cheminDepuisUrl(u ?? null)),
    ttl,
  );

// Champs fichiers d'un adhérent (photo + documents). Le certificat médical
// (donnée de santé) est traité comme les autres → toujours signé.
export const CHAMPS_DOCS_ADHERENT = [
  "photo_url",
  "fiche_inscription_url",
  "reglement_url",
  "certificat_medical_url",
] as const;

/**
 * Remplace les 4 champs fichiers de CHAQUE adhérent d'une liste par des URLs
 * SIGNÉES fraîches, en UN SEUL appel batch (createSignedUrls) pour toute la
 * liste. Fail-closed : un champ non signable (absent/erreur) devient null,
 * jamais l'URL publique. Rétrocompatible (URLs publiques stockées → chemin →
 * signé).
 */
export async function signerDocsAdherents<T extends Record<string, unknown>>(
  rows: T[],
  ttl: number = SIGNED_URL_TTL,
): Promise<T[]> {
  const plat = rows.flatMap((a) =>
    CHAMPS_DOCS_ADHERENT.map((c) => (a[c] as string | null | undefined) ?? null),
  );
  const signes = await signerUrls(plat, ttl);
  const n = CHAMPS_DOCS_ADHERENT.length;
  return rows.map((a, i) => {
    const o: Record<string, unknown> = { ...a };
    CHAMPS_DOCS_ADHERENT.forEach((c, j) => {
      o[c] = signes[i * n + j];
    });
    return o as T;
  });
}
