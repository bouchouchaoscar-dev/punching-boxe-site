import type { SupabaseClient } from "@supabase/supabase-js";
import { matchKey } from "./anciennete";
import { estActifCompte } from "./adherents-actifs";
import {
  compteDansFoyer,
  resoudreFoyerCible,
  type FoyerSource,
  type ResolutionFoyer,
} from "./foyer";

// ============================================================
// Orchestration serveur du foyer (lecture + fusion). S'appuie sur les fonctions
// pures de lib/foyer.ts. Source de vérité du décompte de remise familiale.
// ============================================================

export type RattachementInput = {
  nom?: string;
  prenom?: string;
  date_naissance?: string;
};

const COLS_FOYER =
  "id, prenom, nom, statut_paiement, echeances_payees, mode_paiement, annule_at";

/** Prénom + nom (nom en capitales) d'une ligne foyer, pour l'affichage. */
function nomComplet(r: { prenom?: string | null; nom?: string | null }): string {
  return `${(r.prenom ?? "").trim()} ${(r.nom ?? "").trim()}`.trim();
}

/** Garde les rattachements réellement renseignés (au moins un champ). */
export function rattachementsRenseignes(
  rats?: RattachementInput[] | null,
): RattachementInput[] {
  return (rats ?? []).filter(
    (r) => r && (r.nom?.trim() || r.prenom?.trim() || r.date_naissance?.trim()),
  );
}

/** Résout un membre cité (nom+prénom+naissance) en foyer/titulaire via match_key. */
export async function resoudreMembre(
  supabase: SupabaseClient,
  m: RattachementInput,
): Promise<FoyerSource> {
  const key = matchKey(m.nom ?? "", m.prenom ?? "", m.date_naissance);
  if (!key) return { etat: "introuvable" };
  const { data } = await supabase
    .from("adherents")
    .select(
      "foyer_id, titulaire_id, statut_paiement, echeances_payees, mode_paiement, annule_at",
    )
    .eq("match_key", key);
  const rows = data ?? [];
  if (rows.length === 0) return { etat: "introuvable" };
  // On ne retient que les dossiers ACTIFS (non fermés). Une personne dont tous
  // les dossiers sont fermés/désinscrits est "ferme" (trouvée mais arrêtée).
  const actifs = rows.filter((r) => estActifCompte(r as any));
  if (actifs.length === 0) return { etat: "ferme" };
  // Foyers DISTINCTS représentés par les dossiers ACTIFS (foyer_id, sinon titulaire).
  const households = new Set(
    actifs.map((r) => (r.foyer_id as string | null) ?? `t:${r.titulaire_id}`),
  );
  if (households.size > 1) return { etat: "ambigu" };
  const first = actifs[0];
  return {
    etat: "ok",
    foyerId: (first.foyer_id as string | null) ?? null,
    titulaireId: first.titulaire_id as string,
  };
}

/** Foyer actuel d'un titulaire (hérité de ses dossiers existants), sinon null. */
async function foyerDuTitulaire(
  supabase: SupabaseClient,
  titulaireId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("adherents")
    .select("foyer_id")
    .eq("titulaire_id", titulaireId)
    .not("foyer_id", "is", null)
    .limit(1);
  return (data?.[0]?.foyer_id as string | null) ?? null;
}

/** Lignes d'un scope simple : par foyer_id si fourni, sinon par titulaire. */
async function lireScope(
  supabase: SupabaseClient,
  foyerId: string | null,
  titulaireId: string,
): Promise<any[]> {
  const q = supabase.from("adherents").select(COLS_FOYER);
  const { data } = foyerId
    ? await q.eq("foyer_id", foyerId)
    : await q.eq("titulaire_id", titulaireId);
  return data ?? [];
}

/** Lignes de l'UNION (sans écrire) : foyers réels ∪ titulaires sans foyer. */
async function lireUnion(
  supabase: SupabaseClient,
  foyers: string[],
  titulaires: string[],
): Promise<any[]> {
  const byId = new Map<string, any>();
  if (foyers.length) {
    const { data } = await supabase
      .from("adherents")
      .select(COLS_FOYER)
      .in("foyer_id", foyers);
    for (const r of data ?? []) byId.set(r.id, r);
  }
  if (titulaires.length) {
    const { data } = await supabase
      .from("adherents")
      .select(COLS_FOYER)
      .in("titulaire_id", titulaires)
      .is("foyer_id", null);
    for (const r of data ?? []) byId.set(r.id, r);
  }
  return [...byId.values()];
}

/** Décompte + noms des membres qui COMPTENT, parmi des lignes foyer. */
function decompteEtNoms(rows: any[]): { nb: number; noms: string[] } {
  const comptes = rows.filter(compteDansFoyer);
  return {
    nb: comptes.length,
    noms: comptes.map(nomComplet).filter(Boolean),
  };
}

export type AnalyseFoyer =
  | { ok: false; raison: "introuvable" | "ferme" | "ambigu" }
  | {
      ok: true;
      foyerFinal: string | null; // foyer_id à poser sur le NOUVEAU dossier
      nbMembres: number; // membres déjà comptés (rang du nouveau = +1)
      membresNoms: string[]; // noms des membres comptés (confirmation visuelle)
      merges: (ResolutionFoyer & { ok: true }) | null; // écritures à appliquer
    };

/**
 * Analyse le foyer pour une nouvelle inscription (LECTURE SEULE).
 * - sans rattachement : décompte du scope hérité (foyer_id ou titulaire) →
 *   comportement groupé préservé (aucune écriture, foyer_id reste NULL).
 * - avec rattachement(s) : résout + calcule la cible/fusion + décompte l'union.
 */
export async function analyserFoyer(
  supabase: SupabaseClient,
  args: {
    titulaireId: string;
    rattachements?: RattachementInput[] | null;
    newId: string;
  },
): Promise<AnalyseFoyer> {
  const { titulaireId, newId } = args;
  const foyerProprio = await foyerDuTitulaire(supabase, titulaireId);
  const rats = rattachementsRenseignes(args.rattachements);

  if (rats.length === 0) {
    const rows = await lireScope(supabase, foyerProprio, titulaireId);
    const { nb, noms } = decompteEtNoms(rows);
    return {
      ok: true,
      foyerFinal: foyerProprio,
      nbMembres: nb,
      membresNoms: noms,
      merges: null,
    };
  }

  const membres = await Promise.all(
    rats.map((r) => resoudreMembre(supabase, r)),
  );
  const res = resoudreFoyerCible(
    { titulaireId, foyerId: foyerProprio },
    membres,
    newId,
  );
  if (!res.ok) return { ok: false, raison: res.raison };

  const rows = await lireUnion(
    supabase,
    [res.cible, ...res.foyersAReecrire],
    res.titulairesAtagger,
  );
  const { nb, noms } = decompteEtNoms(rows);
  return {
    ok: true,
    foyerFinal: res.cible,
    nbMembres: nb,
    membresNoms: noms,
    merges: res,
  };
}

/** Applique les fusions/affectations de foyer_id (écritures). */
export async function appliquerMerges(
  supabase: SupabaseClient,
  res: ResolutionFoyer & { ok: true },
): Promise<void> {
  if (res.foyersAReecrire.length) {
    await supabase
      .from("adherents")
      .update({ foyer_id: res.cible })
      .in("foyer_id", res.foyersAReecrire);
  }
  if (res.titulairesAtagger.length) {
    await supabase
      .from("adherents")
      .update({ foyer_id: res.cible })
      .in("titulaire_id", res.titulairesAtagger)
      .is("foyer_id", null);
  }
}
