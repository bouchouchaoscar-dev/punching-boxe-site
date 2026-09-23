import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import {
  planningActif,
  choisirSourceReprise,
  calculerReprise,
  type Cours,
  type Affectation,
  type PeriodeFermeture,
  type Prof,
} from "@/lib/planning";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function calculer(supabase: SupabaseClient, semaine: string) {
  const { data: per } = await supabase.from("periodes_fermeture").select("*");
  const periodes = (per ?? []) as PeriodeFermeture[];
  const { source, sourceFermee } = choisirSourceReprise(semaine, periodes);

  const [{ data: coursRows }, { data: affSource }, { data: affCible }, { data: profRows }] = await Promise.all([
    supabase.from("cours").select("*"),
    supabase.from("affectations").select("*").eq("semaine", source),
    supabase.from("affectations").select("*").eq("semaine", semaine),
    supabase.from("profs").select("id, actif").eq("actif", true),
  ]);
  const profsActifsIds = new Set(((profRows as Prof[] | null) ?? []).map((p) => p.id));
  const r = calculerReprise(
    semaine,
    (coursRows as Cours[] | null) ?? [],
    (affSource as Affectation[] | null) ?? [],
    (affCible as Affectation[] | null) ?? [],
    periodes,
    profsActifsIds,
  );
  return { source, sourceFermee, ...r };
}

// GET — aperçu (dry-run) : ?semaine=YYYY-MM-DD.
export async function GET(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  const semaine = new URL(request.url).searchParams.get("semaine") || "";
  if (!ISO.test(semaine)) return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });

  const r = await calculer(getSupabaseAdmin(), semaine);
  return NextResponse.json({ source: r.source, sourceFermee: r.sourceFermee, reprises: r.reprises, ignorees: r.ignorees });
}

// POST — applique la reprise (idempotent, ajoute seulement). Aucun mail.
export async function POST(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { semaine?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const semaine = (body.semaine || "").trim();
  if (!ISO.test(semaine)) return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const r = await calculer(supabase, semaine);
  if (r.aInserer.length > 0) {
    const { error } = await supabase
      .from("affectations")
      .upsert(r.aInserer, { onConflict: "cours_id,semaine,prof_id", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, source: r.source, sourceFermee: r.sourceFermee, reprises: r.reprises, ignorees: r.ignorees });
}
