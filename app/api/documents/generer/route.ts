import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { genererEtDeposerDocs } from "@/lib/pdf/generer-server";
import type { FicheData, ReglementData } from "@/lib/pdf/types";

export const runtime = "nodejs";

// POST — génère la FICHE + le RÈGLEMENT remplis et signés (à partir des données
// + signature saisies à l'inscription), les dépose dans le bucket sous
// {adherentId}/fiche.pdf et {adherentId}/reglement.pdf, et renvoie leurs URLs.
// (L'auto-validation + la trace signee_at/IP sont posées à la création du dossier.)
export async function POST(request: Request) {
  let body: {
    adherentId?: string;
    fiche?: FicheData;
    reglement?: ReglementData;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const { adherentId, fiche, reglement } = body;
  if (!adherentId || !fiche || !reglement) {
    return NextResponse.json({ error: "Données manquantes." }, { status: 400 });
  }
  // Stockage non configuré → dégradation sûre (comme l'upload de documents).
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ficheUrl: null, reglementUrl: null });
  }

  const supabase = getSupabaseAdmin();
  try {
    const urls = await genererEtDeposerDocs(
      supabase,
      adherentId,
      fiche,
      reglement,
    );
    return NextResponse.json(urls);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Échec de la génération." },
      { status: 500 },
    );
  }
}
