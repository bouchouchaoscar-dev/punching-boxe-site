import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif } from "@/lib/planning";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Montant "42" / "42,5" / "42.50" → nombre à 2 décimales (>= 0), sinon null.
function parseMontant(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim().replace(",", ".") : "";
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return n >= 0 ? n : null;
}

// GET — historique des taux d'un prof (du plus récent au plus ancien). ADMIN only :
// un montant n'est JAMAIS exposé à un rôle coach (isAdminRequest fail-closed).
export async function GET(request: Request, { params }: Ctx) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ taux: [] });
  const { id } = await params;

  const supabase = getSupabaseAdmin();
  const rows = exigerData(
    await supabase
      .from("taux_horaire_prof")
      .select("id, montant_horaire, date_effet")
      .eq("prof_id", id)
      .order("date_effet", { ascending: false }),
    "taux prof: liste",
  );
  const taux = (rows ?? []).map((t) => ({
    id: t.id as string,
    montant_horaire: Number(t.montant_horaire),
    date_effet: t.date_effet as string,
  }));
  return NextResponse.json({ taux }, { headers: { "Cache-Control": "no-store" } });
}

// POST — ajoute un NOUVEAU taux avec date d'effet (sans écraser les anciens).
// Un même (prof, date d'effet) est remplacé (upsert) pour éviter les doublons.
export async function POST(request: Request, { params }: Ctx) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Identifiant requis." }, { status: 400 });

  let body: { montant_horaire?: unknown; date_effet?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Corps invalide." }, { status: 400 }); }
  const montant = parseMontant(body.montant_horaire);
  const dateEffet = (body.date_effet || "").trim();
  if (montant == null) return NextResponse.json({ error: "Montant invalide (en euros, 2 décimales max)." }, { status: 400 });
  if (!ISO.test(dateEffet)) return NextResponse.json({ error: "Date d'effet invalide." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("taux_horaire_prof")
    .upsert({ prof_id: id, montant_horaire: montant, date_effet: dateEffet }, { onConflict: "prof_id,date_effet" })
    .select("id, montant_horaire, date_effet")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ taux: data });
}

// DELETE — retire une entrée de taux (corriger une saisie). { tauxId }
export async function DELETE(request: Request, { params }: Ctx) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  const { id } = await params;

  let body: { tauxId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Corps invalide." }, { status: 400 }); }
  const tauxId = (body.tauxId || "").trim();
  if (!tauxId) return NextResponse.json({ error: "tauxId requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("taux_horaire_prof").delete().eq("id", tauxId).eq("prof_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
