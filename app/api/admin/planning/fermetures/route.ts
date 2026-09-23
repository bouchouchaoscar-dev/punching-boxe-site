import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif } from "@/lib/planning";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET — liste des périodes de fermeture (tri par date de début).
export async function GET(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ periodes: [] });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("periodes_fermeture")
    .select("*")
    .order("date_debut", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ periodes: data ?? [] });
}

// POST — créer une période de fermeture.
export async function POST(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { libelle?: string; date_debut?: string; date_fin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const dd = (body.date_debut || "").trim();
  const df = (body.date_fin || "").trim();
  if (!ISO.test(dd) || !ISO.test(df)) {
    return NextResponse.json({ error: "Dates de début et de fin requises." }, { status: 400 });
  }
  if (df < dd) return NextResponse.json({ error: "La date de fin précède le début." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("periodes_fermeture")
    .insert({ libelle: (body.libelle || "").trim() || null, date_debut: dd, date_fin: df })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ periode: data });
}

// DELETE — supprimer une période (id dans le corps).
export async function DELETE(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const id = (body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Identifiant requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("periodes_fermeture").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
