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
    .select("titulaire_id, foyer_id")
    .eq("id", id)
    .maybeSingle();

  // Pas de titulaire (anciens dossiers) → pas de foyer.
  if (!cur?.titulaire_id) {
    return NextResponse.json({ titulaire_id: null, membres: [] });
  }

  // Foyer = dossiers du même titulaire (groupés) ∪ même foyer_id (comptes
  // séparés rattachés). Les rattachés ont un titulaire_id différent.
  const cols =
    "id, nom, prenom, lien_parente, type_adherent, statut_paiement, titulaire_id, foyer_id";
  let q = supabase.from("adherents").select(cols);
  q = cur.foyer_id
    ? q.or(`titulaire_id.eq.${cur.titulaire_id},foyer_id.eq.${cur.foyer_id}`)
    : q.eq("titulaire_id", cur.titulaire_id);

  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Marqueur "compte séparé" : dossier rattaché via foyer_id (titulaire ≠ courant).
  const membres = (data ?? []).map((m) => ({
    ...m,
    compte_separe: m.titulaire_id !== cur.titulaire_id,
  }));

  return NextResponse.json({ titulaire_id: cur.titulaire_id, membres });
}
