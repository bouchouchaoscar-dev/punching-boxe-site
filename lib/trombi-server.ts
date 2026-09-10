// Logique SERVEUR partagée du trombinoscope (export PDF admin + endpoint coach).
// Source unique : mêmes actifs, même tri A→Z, même mapping vers une forme
// PUBLIQUE sans aucune donnée sensible.
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { signerUrls, cheminDepuisUrl } from "@/lib/storage-url";
import { estActifCompte } from "@/lib/adherents-actifs";
import { statutTrombi } from "@/lib/paiement";
import { formuleLabel } from "@/lib/pricing";
import { formaterPrenom, formaterNom } from "@/lib/noms";
import type { TrombiMembre } from "@/lib/pdf/Trombinoscope";
import type { Adherent } from "@/lib/types";

export const initialesTrombi = (prenom: string, nom: string) =>
  `${(prenom || "").trim()[0] ?? ""}${(nom || "").trim()[0] ?? ""}`.toUpperCase() ||
  "?";

// Photo en data-URI pour le PDF (trombinoscope admin + coach). On TÉLÉCHARGE le
// binaire via storage.download (service_role) — fonctionne que le bucket soit
// public ou PRIVÉ, contrairement à un fetch d'URL. Chemin extrait par le helper
// (URL publique existante OU chemin). Fail-closed : null si absent/erreur.
export async function photoDataUri(url: string | null): Promise<string | null> {
  const chemin = cheminDepuisUrl(url);
  if (!chemin) return null;
  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(STORAGE_BUCKET)
      .download(chemin);
    if (error || !data) return null;
    const type = data.type || "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const b64 = Buffer.from(await data.arrayBuffer()).toString("base64");
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

/**
 * URLs de photos SIGNÉES (temporaires) alignées sur `actifs`, via la SOURCE
 * UNIQUE de signature (lib/storage-url). Un seul appel batch, fail-closed.
 */
export async function chargerPhotosSignees(
  actifs: Adherent[],
): Promise<(string | null)[]> {
  return signerUrls(actifs.map((a) => a.photo_url));
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
