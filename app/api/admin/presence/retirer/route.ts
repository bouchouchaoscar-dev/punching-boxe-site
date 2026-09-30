import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { presenceActif } from "@/lib/presence";

export const runtime = "nodejs";

// POST /api/admin/presence/retirer — { presenceId } (retrait d'une présence).
export async function POST(request: Request) {
  if (!presenceActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Indisponible." }, { status: 503 });

  let body: { presenceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const id = (body.presenceId || "").trim();
  if (!id) return NextResponse.json({ error: "Présence requise." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("presences").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Retrait impossible." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
