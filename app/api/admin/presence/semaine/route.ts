import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { presenceActif } from "@/lib/presence";
import { dateDuJour, toISODate } from "@/lib/planning";

export const runtime = "nodejs";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/admin/presence/semaine?semaine=<lundi ISO> — nombre de présents par
// séance (clé "coursId|date") pour la grille Historique.
export async function GET(request: Request) {
  if (!presenceActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ counts: {} });

  const semaine = new URL(request.url).searchParams.get("semaine");
  if (!semaine || !ISO.test(semaine)) return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });
  const lundi = semaine;
  const dimanche = toISODate(dateDuJour(semaine, 7));

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("presences")
    .select("cours_id, date_seance")
    .gte("date_seance", lundi)
    .lte("date_seance", dimanche);

  const counts: Record<string, number> = {};
  for (const p of data ?? []) {
    const k = `${p.cours_id}|${p.date_seance}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return NextResponse.json({ counts }, { headers: { "Cache-Control": "no-store" } });
}
