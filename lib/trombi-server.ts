// Logique SERVEUR partagée du trombinoscope (export PDF admin + endpoint coach).
// Source unique : mêmes actifs, même tri A→Z, même mapping vers une forme
// PUBLIQUE sans aucune donnée sensible.
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { estActifCompte } from "@/lib/adherents-actifs";
import { statutTrombi } from "@/lib/paiement";
import { formuleLabel } from "@/lib/pricing";
import { formaterPrenom, formaterNom } from "@/lib/noms";
import type { TrombiMembre } from "@/lib/pdf/Trombinoscope";
import type { Adherent } from "@/lib/types";

export const initialesTrombi = (prenom: string, nom: string) =>
  `${(prenom || "").trim()[0] ?? ""}${(nom || "").trim()[0] ?? ""}`.toUpperCase() ||
  "?";

export async function photoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return `data:${type};base64,${b64}`;
  } catch {
    return null;
  }
}

async function pool<T, R>(
  items: T[],
  n: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/** Photos (data-URI) des actifs, téléchargées avec un pool de concurrence.
 *  Réservé au PDF (qui DOIT embarquer les images). */
export const chargerPhotos = (actifs: Adherent[]) =>
  pool(actifs, 8, (a) => photoDataUri(a.photo_url));

// Extrait le chemin objet (`<uuid>/photo.jpg`) depuis l'URL stockée (publique).
function cheminStorage(url: string | null): string | null {
  if (!url) return null;
  const marqueur = `/${STORAGE_BUCKET}/`;
  const i = url.indexOf(marqueur);
  if (i === -1) return null;
  const chemin = url.slice(i + marqueur.length).split("?")[0];
  return chemin || null;
}

// Durée de validité des URLs signées des photos (1 h). La page coach est
// rechargée régulièrement → régénération à chaque chargement.
const SIGNED_URL_TTL = 3600;

/**
 * URLs de photos SIGNÉES (temporaires) alignées sur `actifs`. Un seul appel
 * batch (createSignedUrls) : rapide (génération de tokens, AUCUN téléchargement
 * ni encodage d'image). L'URL ne contient qu'un UUID + un token — aucune PII.
 * Le navigateur charge ensuite les images en parallèle (qualité d'origine).
 */
export async function chargerPhotosSignees(
  actifs: Adherent[],
): Promise<(string | null)[]> {
  const chemins = actifs.map((a) => cheminStorage(a.photo_url));
  const valides = chemins.filter((c): c is string => !!c);
  if (!valides.length) return chemins.map(() => null);

  const supabase = getSupabaseAdmin();
  const { data } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(valides, SIGNED_URL_TTL);

  // Réponse alignée sur l'ordre des chemins demandés → zip par index.
  const map = new Map<string, string | null>();
  valides.forEach((p, i) => map.set(p, data?.[i]?.signedUrl ?? null));
  return chemins.map((c) => (c ? (map.get(c) ?? null) : null));
}

// Membre PUBLIC : AUCUNE donnée sensible (ni email, ni téléphone, ni adresse,
// ni montant, ni date de naissance, ni id). Superset structurel de TrombiMembre
// avec 3 champs NON sensibles nécessaires aux filtres de la vue coach
// (`type` jeune/adulte, `package` = code formule, `statutCode`) — ils ne sont
// que la base de ce qui est déjà affiché (formule + statut + catégorie d'âge).
export type MembrePublic = TrombiMembre & {
  package: string;
  type: string;
  statutCode: string;
};

export function toMembrePublic(a: Adherent, photo: string | null): MembrePublic {
  const st = statutTrombi(a);
  return {
    nom: formaterNom(a.nom),
    prenom: formaterPrenom(a.prenom),
    formule: formuleLabel(a.package, a.option_prepa_physique),
    statutLabel: st.label,
    statutCouleur: st.couleur,
    photo,
    initiales: initialesTrombi(a.prenom, a.nom),
    package: a.package,
    type: a.type_adherent,
    statutCode: st.code,
  };
}

// Colonnes STRICTEMENT nécessaires au trombinoscope (actif + tri + statut +
// formule + photo). Évite un select("*") coûteux (nombreuses colonnes/URLs
// inutiles) → réponse plus rapide. Partagé par la vue coach et l'export PDF.
const COLS_TROMBI =
  "id,nom,prenom,saison,statut_paiement,mode_paiement,nb_echeances,echeances_payees,annule_at,package,option_prepa_physique,type_adherent,photo_url";

// Actifs triés A→Z, filtrés par ids puis (à défaut) par saison. `ids` a la
// priorité (∩ actifs = sécurité serveur). Source unique du filtrage serveur.
export async function chargerActifsTrombi(opts: {
  ids?: string[] | null;
  saison?: string;
}): Promise<Adherent[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("adherents").select(COLS_TROMBI);
  let actifs = ((data ?? []) as unknown as Adherent[]).filter(estActifCompte);

  const ids = opts.ids && opts.ids.length ? opts.ids : null;
  const saison = opts.saison || "";
  if (ids) {
    const set = new Set(ids);
    actifs = actifs.filter((a) => set.has(a.id));
  } else if (saison && saison !== "all") {
    actifs = actifs.filter((a) => a.saison === saison);
  }

  actifs.sort(
    (a, b) =>
      (a.nom || "").localeCompare(b.nom || "", "fr", { sensitivity: "base" }) ||
      (a.prenom || "").localeCompare(b.prenom || "", "fr", {
        sensitivity: "base",
      }),
  );
  return actifs;
}
