import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

// GET — historique des campagnes (envoyées + brouillons).
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ campagnes: [] });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("campagnes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campagnes: data ?? [] });
}

// POST — créer une campagne (brouillon).
export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("campagnes")
    .insert({
      titre: String(body.titre || "Sans titre"),
      objet: String(body.objet || ""),
      contenu: String(body.contenu || ""),
      liste_type: String(body.liste_type || "mixte"),
      liste_filtre: body.liste_filtre ?? null,
      nb_destinataires: Number(body.nb_destinataires) || 0,
      statut: String(body.statut || "brouillon"),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campagne: data }, { status: 201 });
}
