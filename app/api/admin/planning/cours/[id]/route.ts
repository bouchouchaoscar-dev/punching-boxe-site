import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif } from "@/lib/planning";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// DELETE — supprimer un cours. Les affectations liées partent en cascade
// (affectations.cours_id … on delete cascade).
export async function DELETE(request: Request, { params }: Ctx) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Identifiant requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("cours").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
