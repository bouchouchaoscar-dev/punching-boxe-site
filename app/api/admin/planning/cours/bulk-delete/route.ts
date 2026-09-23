import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif, lundiDeLaSemaine, toISODate, MSG_HISTORIQUE_COURS } from "@/lib/planning";

export const runtime = "nodejs";

// POST — suppression de GROUPE (tout ou rien). Si UN SEUL cours du groupe a un
// historique d'affectations (semaine passée ou en cours), rien n'est supprimé (409).
export async function POST(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const ids = [...new Set((body.ids ?? []).map((s) => String(s).trim()).filter(Boolean))];
  if (ids.length === 0) return NextResponse.json({ error: "Aucun cours." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const lundiCourant = toISODate(lundiDeLaSemaine(new Date()));

  // Un seul créneau protégé → on bloque tout (tout ou rien).
  const { count } = await supabase
    .from("affectations")
    .select("id", { count: "exact", head: true })
    .in("cours_id", ids)
    .lte("semaine", lundiCourant);
  if (count && count > 0) {
    return NextResponse.json({ error: MSG_HISTORIQUE_COURS, code: "historique" }, { status: 409 });
  }

  const { error } = await supabase.from("cours").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, supprimes: ids.length });
}
