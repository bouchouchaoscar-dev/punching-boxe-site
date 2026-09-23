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

// GET — affectations d'une semaine (?semaine=YYYY-MM-DD, lundi). Peut renvoyer
// PLUSIEURS lignes par cours (un prof chacune).
export async function GET(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ affectations: [] });

  const semaine = new URL(request.url).searchParams.get("semaine") || "";
  if (!ISO.test(semaine)) return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("affectations").select("*").eq("semaine", semaine);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ affectations: data ?? [] });
}

// POST — AJOUTER un prof à un cours pour une semaine (silencieux, aucun mail).
// Idempotent : si le prof est déjà affecté, ne fait rien. Refuse un jour fermé.
export async function POST(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { cours_id?: string; prof_id?: string; semaine?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const coursId = (body.cours_id || "").trim();
  const profId = (body.prof_id || "").trim();
  const semaine = (body.semaine || "").trim();
  if (!coursId || !profId) return NextResponse.json({ error: "Cours et prof requis." }, { status: 400 });
  if (!ISO.test(semaine)) return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // Refus si le jour du cours est fermé cette semaine-là.
  const { data: coursRow } = await supabase.from("cours").select("*").eq("id", coursId).maybeSingle();
  const c = coursRow as Cours | null;
  if (c?.jour_semaine) {
    const { data: per } = await supabase.from("periodes_fermeture").select("*");
    const dISO = toISODate(dateDuJour(semaine, c.jour_semaine));
    if (estFerme(dISO, (per ?? []) as PeriodeFermeture[])) {
      return NextResponse.json({ error: "Jour fermé : affectation impossible." }, { status: 409 });
    }
  }

  // Insert idempotent (contrainte unique cours_id, semaine, prof_id).
  const { error } = await supabase
    .from("affectations")
    .upsert(
      { cours_id: coursId, prof_id: profId, semaine, statut: "prevu" },
      { onConflict: "cours_id,semaine,prof_id", ignoreDuplicates: true },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE — RETIRER un prof d'un cours pour une semaine (silencieux, aucun mail).
export async function DELETE(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { cours_id?: string; prof_id?: string; semaine?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const coursId = (body.cours_id || "").trim();
  const profId = (body.prof_id || "").trim();
  const semaine = (body.semaine || "").trim();
  if (!coursId || !profId || !ISO.test(semaine))
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("affectations")
    .delete()
    .eq("cours_id", coursId)
    .eq("prof_id", profId)
    .eq("semaine", semaine);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
