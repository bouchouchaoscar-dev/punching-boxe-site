import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "@/lib/supabase";
import { renderFichePdf, renderReglementPdf } from "./render";
import type { FicheData, ReglementData } from "./types";
import type { InscriptionPayload } from "@/lib/inscription";

// Génère la FICHE + le RÈGLEMENT remplis/signés et les dépose dans le bucket
// sous {adherentId}/fiche.pdf et {adherentId}/reglement.pdf. Rendu ET upload
// PARALLÉLISÉS (les 2 PDF en même temps) pour réduire la latence sur le chemin
// critique de l'inscription. Renvoie les URLs publiques.
export async function genererEtDeposerDocs(
  supabase: SupabaseClient,
  adherentId: string,
  fiche: FicheData,
  reglement: ReglementData,
): Promise<{ ficheUrl: string; reglementUrl: string }> {
  const [ficheBuf, regBuf] = await Promise.all([
    renderFichePdf(fiche),
    renderReglementPdf(reglement),
  ]);
  const upload = async (name: string, buf: Buffer): Promise<string> => {
    const path = `${adherentId}/${name}`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buf, { contentType: "application/pdf", upsert: true });
    if (error) throw error;
    return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data
      .publicUrl;
  };
  const [ficheUrl, reglementUrl] = await Promise.all([
    upload("fiche.pdf", ficheBuf),
    upload("reglement.pdf", regBuf),
  ]);
  return { ficheUrl, reglementUrl };
}

/**
 * Résout les URLs des documents pour une inscription :
 *  - si le client envoie les DONNÉES (adherentId + doc_fiche + doc_reglement),
 *    on génère + dépose CÔTÉ SERVEUR (garanti avant l'insert) ;
 *  - sinon, on retombe sur les URLs éventuellement fournies (compat).
 * Un échec de génération est journalisé sans annuler l'inscription (best-effort,
 * comme l'ancien flux client) → l'admin pourra la régénérer si besoin.
 */
export async function resoudreDocs(
  supabase: SupabaseClient,
  payload: InscriptionPayload,
): Promise<{ ficheUrl: string | null; reglementUrl: string | null }> {
  if (payload.adherentId && payload.doc_fiche && payload.doc_reglement) {
    try {
      return await genererEtDeposerDocs(
        supabase,
        payload.adherentId,
        payload.doc_fiche,
        payload.doc_reglement,
      );
    } catch (e) {
      console.error("Génération documents (inscription):", e);
    }
  }
  return {
    ficheUrl: payload.fiche_inscription_url ?? null,
    reglementUrl: payload.reglement_url ?? null,
  };
}
