import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

// GET — tous les paiements (pour agréger l'« encaissé » par adhérent côté liste).
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ paiements: [] });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("paiements")
    .select("adherent_id, montant, statut");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ paiements: data ?? [] });
}
