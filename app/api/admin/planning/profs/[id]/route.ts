import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif, lundiDeLaSemaine, toISODate, MSG_PROF_HISTORIQUE } from "@/lib/planning";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function compter(supabase: ReturnType<typeof getSupabaseAdmin>, id: string) {
  const lundiCourant = toISODate(lundiDeLaSemaine(new Date()));
  const [{ count: hist }, { count: fut }] = await Promise.all([
    supabase.from("affectations").select("id", { count: "exact", head: true }).eq("prof_id", id).lte("semaine", lundiCourant),
    supabase.from("affectations").select("id", { count: "exact", head: true }).eq("prof_id", id).gt("semaine", lundiCourant),
  ]);
  return { historique: hist ?? 0, futures: fut ?? 0, lundiCourant };
}

// GET — état d'un prof pour piloter les modales : historique (passé/en cours) + futures.
export async function GET(request: Request, { params }: Ctx) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ historique: 0, futures: 0 });
  const { id } = await params;
  const { historique, futures } = await compter(getSupabaseAdmin(), id);
  return NextResponse.json({ historique, futures });
}

// POST — ARCHIVER un prof : actif=false + libère ses cours À VENIR (le passé reste).
export async function POST(request: Request, { params }: Ctx) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Identifiant requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { futures, lundiCourant } = await compter(supabase, id);
  // Libère les affectations futures, puis archive (actif=false).
  await supabase.from("affectations").delete().eq("prof_id", id).gt("semaine", lundiCourant);
  const { error } = await supabase.from("profs").update({ actif: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, futures });
}

// DELETE — supprimer un prof. BLOQUÉ (409) s'il a un historique (passé/en cours).
// Sinon : supprime ses affectations futures (RESTRICT) puis le prof lui-même.
export async function DELETE(request: Request, { params }: Ctx) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Identifiant requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { historique, futures, lundiCourant } = await compter(supabase, id);
  if (historique > 0) {
    return NextResponse.json({ error: MSG_PROF_HISTORIQUE, code: "historique", futures }, { status: 409 });
  }
  // Aucune affectation passée : retirer les futures (RESTRICT) puis supprimer.
  await supabase.from("affectations").delete().eq("prof_id", id).gt("semaine", lundiCourant);
  const { error } = await supabase.from("profs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, futures });
}
