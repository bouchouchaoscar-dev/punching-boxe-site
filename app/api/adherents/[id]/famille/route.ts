import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET — membres du foyer : tous les dossiers rattachés au même titulaire_id que
// l'adhérent courant (affichage temps réel, le dossier courant est inclus).
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ titulaire_id: null, membres: [] });
  }
  const supabase = getSupabaseAdmin();

  const { data: cur } = await supabase
    .from("adherents")
    .select("titulaire_id")
    .eq("id", id)
    .maybeSingle();

  // Pas de titulaire (anciens dossiers) → pas de foyer.
  if (!cur?.titulaire_id) {
    return NextResponse.json({ titulaire_id: null, membres: [] });
  }

  const { data, error } = await supabase
    .from("adherents")
    .select("id, nom, prenom, lien_parente, type_adherent, statut_paiement")
    .eq("titulaire_id", cur.titulaire_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ titulaire_id: cur.titulaire_id, membres: data ?? [] });
}
