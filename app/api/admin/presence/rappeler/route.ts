import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

// POST /api/admin/presence/rappeler — marque un essai « rappelé » (date + note
// courte + qui), ou annule ce marquage. Admin only, fail-closed.
//   { essaiId, note? }            → marque rappelé (rappele_at=now, rappel_note, rappele_par)
//   { essaiId, annuler: true }    → annule (remet rappele_at/note/par à null)
export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { essaiId?: string; note?: string; annuler?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const essaiId = String(body.essaiId || "").trim();
  if (!essaiId) return NextResponse.json({ error: "essaiId requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();

  if (body.annuler) {
    const { error } = await supabase
      .from("essais")
      .update({ rappele_at: null, rappel_note: null, rappele_par: null })
      .eq("id", essaiId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, annule: true });
  }

  const note = (body.note || "").trim().slice(0, 120) || null;
  const { error } = await supabase
    .from("essais")
    .update({ rappele_at: new Date().toISOString(), rappel_note: note, rappele_par: "admin" })
    .eq("id", essaiId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
