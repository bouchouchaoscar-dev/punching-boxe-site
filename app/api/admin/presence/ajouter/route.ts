import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { presenceActif } from "@/lib/presence";

export const runtime = "nodejs";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/admin/presence/ajouter — { coursId, date, dossierId } (ajout manuel).
export async function POST(request: Request) {
  if (!presenceActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Indisponible." }, { status: 503 });

  let body: { coursId?: string; date?: string; dossierId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const coursId = (body.coursId || "").trim();
  const date = (body.date || "").trim();
  const dossierId = (body.dossierId || "").trim();
  if (!coursId || !dossierId || !ISO.test(date))
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("presences").insert({
    cours_id: coursId,
    date_seance: date,
    dossier_id: dossierId,
    source: "manuel",
    created_by: "admin",
  });
  if (error && error.code !== "23505")
    return NextResponse.json({ error: "Ajout impossible." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
