import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET — détail d'une campagne.
export async function GET(request: Request, { params }: Ctx) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("campagnes")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ campagne: data });
}

// DELETE — supprimer une campagne de l'historique.
export async function DELETE(request: Request, { params }: Ctx) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("campagnes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
