import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";

export const runtime = "nodejs";

// GET — nombre de dossiers déjà rattachés au compte titulaire connecté.
// Sert à l'aperçu de prix du formulaire (remise famille automatique).
// Décompte TOUS les dossiers du titulaire (tous statuts, tous liens de parenté).
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ count: 0 });
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("adherents")
    .select("id", { count: "exact", head: true })
    .eq("titulaire_id", user.id);
  // Dégradation sûre : en cas d'erreur, 0 (aucune remise plutôt que planter).
  if (error) return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: count ?? 0 });
}
