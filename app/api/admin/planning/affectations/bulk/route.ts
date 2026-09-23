import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import {
  planningActif,
  estFerme,
  dateDuJour,
  toISODate,
  type Cours,
  type PeriodeFermeture,
} from "@/lib/planning";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// POST — opération de MASSE atomique sur une sélection de cours d'une semaine.
// Body : { semaine, prof_id, cours_ids: string[], action: "add" | "remove" }.
// add    : ajoute le prof à chaque cours (ignore fermés + déjà affectés) — 1 upsert.
// remove : retire le prof de chaque cours de la sélection — 1 delete.
export async function POST(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { semaine?: string; prof_id?: string; cours_ids?: string[]; action?: "add" | "remove" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const semaine = (body.semaine || "").trim();
  const profId = (body.prof_id || "").trim();
  const action = body.action;
  const coursIds = [...new Set((body.cours_ids ?? []).map((s) => String(s).trim()).filter(Boolean))];
  if (!ISO.test(semaine)) return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });
  if (!profId) return NextResponse.json({ error: "Prof requis." }, { status: 400 });
  if (action !== "add" && action !== "remove")
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  if (coursIds.length === 0) return NextResponse.json({ error: "Aucun cours sélectionné." }, { status: 400 });

  const supabase = getSupabaseAdmin();

  if (action === "remove") {
    const { error } = await supabase
      .from("affectations")
      .delete()
      .eq("semaine", semaine)
      .eq("prof_id", profId)
      .in("cours_id", coursIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action, traites: coursIds.length });
  }

  // add : écarte les cours dont le jour est fermé cette semaine.
  const [{ data: coursRows }, { data: per }] = await Promise.all([
    supabase.from("cours").select("*").in("id", coursIds),
    supabase.from("periodes_fermeture").select("*"),
  ]);
  const periodes = (per ?? []) as PeriodeFermeture[];
  const rows = (coursRows as Cours[] | null ?? [])
    .filter((c) => {
      if (!c.jour_semaine) return true;
      return !estFerme(toISODate(dateDuJour(semaine, c.jour_semaine)), periodes);
    })
    .map((c) => ({ cours_id: c.id, prof_id: profId, semaine, statut: "prevu" as const }));

  if (rows.length === 0) return NextResponse.json({ success: true, action, ajoutes: 0 });

  const { error } = await supabase
    .from("affectations")
    .upsert(rows, { onConflict: "cours_id,semaine,prof_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, action, ajoutes: rows.length });
}
