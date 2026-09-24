import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif, calculerHeuresProfs, type Cours, type Affectation, type PeriodeFermeture, type Prof } from "@/lib/planning";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET — heures par prof sur une période [debut, fin] (ADMIN uniquement).
// ?debut=YYYY-MM-DD&fin=YYYY-MM-DD (bornes sur la date des occurrences).
export async function GET(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ parProf: [] });

  const url = new URL(request.url);
  const debut = url.searchParams.get("debut") || "";
  const fin = url.searchParams.get("fin") || "";
  if (!ISO.test(debut) || !ISO.test(fin)) return NextResponse.json({ error: "Période invalide." }, { status: 400 });

  // Semaines (lundis) susceptibles de contenir une occurrence dans [debut, fin] :
  // du lundi ≤ (debut) au lundi ≤ (fin). On élargit debut de 7 jours par sécurité.
  const [y, m, d] = debut.split("-").map(Number);
  const dm7 = new Date(y, m - 1, d - 7).toISOString().slice(0, 10);

  const supabase = getSupabaseAdmin();
  const [{ data: coursRows }, { data: affRows }, { data: profRows }, { data: perRows }] = await Promise.all([
    supabase.from("cours").select("*"), // inclut les désactivés (historique)
    supabase.from("affectations").select("cours_id, prof_id, semaine").gte("semaine", dm7).lte("semaine", fin),
    supabase.from("profs").select("id, prenom, nom, actif"),
    supabase.from("periodes_fermeture").select("*"),
  ]);

  const res = calculerHeuresProfs({
    cours: (coursRows ?? []) as Cours[],
    affectations: (affRows ?? []) as Affectation[],
    profs: (profRows ?? []) as Prof[],
    periodes: (perRows ?? []) as PeriodeFermeture[],
    debutISO: debut,
    finISO: fin,
  });
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}
