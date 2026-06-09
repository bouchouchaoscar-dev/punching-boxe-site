import type { SupabaseClient } from "@supabase/supabase-js";

// Ancienneté : matching d'identité (natif ↔ ancien importé) + règle des 30€.
// Le SERVEUR est seule autorité : décide l'adhésion via la dernière saison active
// (historique importé + natif confondus), jamais via un champ envoyé par le client.

// Écart (années de début de saison) au-delà duquel on refacture l'adhésion.
export const SEUIL_ADHESION_GAP = 4;

// ---- Normalisation (IDENTIQUE à l'import, pour que les clés correspondent) ----
export function sansAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
// Retire un suffixe de grade « GR » collé au nom (présent dans le fichier importé).
function normaliserNom(s: string): string {
  return s.replace(/\s+GR\b/gi, "").replace(/\s+/g, " ").trim();
}
export function normaliserDate(raw?: string | null): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Clé de matching nom+prénom+naissance. NULL si naissance absente (jamais auto-matchée). */
export function matchKey(
  nom: string,
  prenom: string,
  naissance?: string | null,
): string | null {
  const d = normaliserDate(naissance);
  if (!d) return null;
  return `${sansAccents(normaliserNom(nom))}|${sansAccents(prenom)}|${d}`;
}

export function anneeDebutSaison(saison: string): number {
  return parseInt(saison.slice(0, 4), 10);
}

/** Règle 30€ : pas d'historique → 30€ (nouveau) ; sinon gap ≥ SEUIL → 30€. */
export function doitPayerAdhesion(
  derniereSaisonActive: string | null,
  saisonInscription: string,
): boolean {
  if (!derniereSaisonActive) return true;
  return (
    anneeDebutSaison(saisonInscription) - anneeDebutSaison(derniereSaisonActive) >=
    SEUIL_ADHESION_GAP
  );
}

export type EvaluationAnciennete = {
  paieAdhesion: boolean;
  ancienId: string | null;
  ambigu: boolean;
  matchKey: string | null;
  derniereSaisonActive: string | null;
  motif: "nouveau" | "ancien_recent" | "ancien_eloigne" | "ambigu";
};

/**
 * Évalue l'ancienneté d'une identité pour une saison d'inscription donnée.
 * - cherche les ANCIENS (importés) et les NATIFS (dossiers payés) de même clé,
 * - calcule la dernière saison active (union),
 * - décide l'adhésion + le lien éventuel (1 match) ou le flag ambigu (≥2).
 */
export async function evaluerAnciennete(
  supabase: SupabaseClient,
  identite: { nom: string; prenom: string; date_naissance?: string | null },
  saisonInscription: string,
): Promise<EvaluationAnciennete> {
  const key = matchKey(identite.nom, identite.prenom, identite.date_naissance);
  if (!key) {
    return {
      paieAdhesion: true,
      ancienId: null,
      ambigu: false,
      matchKey: null,
      derniereSaisonActive: null,
      motif: "nouveau",
    };
  }

  // 1) Anciens importés de même clé.
  const { data: anciens } = await supabase
    .from("anciens_adherents")
    .select("id")
    .eq("match_key", key);
  const ancienIds = (anciens ?? []).map((a) => a.id as string);

  let maxAncien: string | null = null;
  if (ancienIds.length > 0) {
    const { data: hist } = await supabase
      .from("historique_saisons")
      .select("saison")
      .in("ancien_id", ancienIds);
    for (const h of hist ?? []) {
      const s = h.saison as string;
      if (!maxAncien || s > maxAncien) maxAncien = s;
    }
  }

  // 2) Dossiers natifs ACTIFS (payés / confirmés espèces / engagés) de même clé.
  const { data: natifs } = await supabase
    .from("adherents")
    .select("saison")
    .eq("match_key", key)
    .or("statut_paiement.in.(paye,confirme_especes),engage_at.not.is.null");
  let maxNatif: string | null = null;
  for (const n of natifs ?? []) {
    const s = n.saison as string | null;
    if (s && (!maxNatif || s > maxNatif)) maxNatif = s;
  }

  // 3) Dernière saison active (union).
  const derniere =
    [maxAncien, maxNatif].filter(Boolean).sort().reverse()[0] ?? null;

  // 4) Lien : 0 → aucun ; 1 → ferme ; ≥2 → ambigu (pas de lien, bénéfice du doute).
  const ambigu = ancienIds.length >= 2;
  const ancienId = ancienIds.length === 1 ? ancienIds[0] : null;
  const paieAdhesion = doitPayerAdhesion(derniere, saisonInscription);

  const motif: EvaluationAnciennete["motif"] = ambigu
    ? "ambigu"
    : !derniere
      ? "nouveau"
      : paieAdhesion
        ? "ancien_eloigne"
        : "ancien_recent";

  return { paieAdhesion, ancienId, ambigu, matchKey: key, derniereSaisonActive: derniere, motif };
}
