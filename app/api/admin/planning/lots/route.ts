import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif } from "@/lib/planning";

export const runtime = "nodejs";

// GET — liste des lots « affecter sur une période » (regroupés par lot_affectation_id)
// avec leurs agrégats (nb d'affectations, période de semaines, cours, profs). Admin only.
export async function GET(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ lots: [] });

  const supabase = getSupabaseAdmin();
  const rows = exigerData(
    await supabase.from("affectations").select("lot_affectation_id, cours_id, prof_id, semaine").not("lot_affectation_id", "is", null),
    "lots: affectations",
  );
  const map = new Map<string, { lot: string; nb: number; coursIds: Set<string>; profIds: Set<string>; min: string; max: string }>();
  for (const a of rows ?? []) {
    const lot = a.lot_affectation_id as string;
    const g = map.get(lot) ?? { lot, nb: 0, coursIds: new Set<string>(), profIds: new Set<string>(), min: a.semaine as string, max: a.semaine as string };
    g.nb++;
    g.coursIds.add(a.cours_id as string);
    g.profIds.add(a.prof_id as string);
    if ((a.semaine as string) < g.min) g.min = a.semaine as string;
    if ((a.semaine as string) > g.max) g.max = a.semaine as string;
    map.set(lot, g);
  }
  const lots = [...map.values()]
    .map((g) => ({ lot: g.lot, nb: g.nb, coursIds: [...g.coursIds], profIds: [...g.profIds], premiereSemaine: g.min, derniereSemaine: g.max }))
    .sort((a, b) => b.derniereSemaine.localeCompare(a.derniereSemaine));
  return NextResponse.json({ lots });
}
