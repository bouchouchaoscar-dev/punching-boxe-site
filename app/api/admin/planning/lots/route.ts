import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif, dateDuJour, toISODate } from "@/lib/planning";
import { partiesParis } from "@/lib/presence";

export const runtime = "nodejs";

// GET — liste des lots « affecter sur une période » (regroupés par lot_affectation_id)
// avec leurs agrégats : nb d'affectations (total + à venir), période, profs, et le
// DÉTAIL PAR COURS (nb total + à venir) pour la suppression partielle. Admin only.
// NB : aucun filtre de période ici — une liste vide = réellement aucun lot en base.
export async function GET(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ lots: [] });

  const supabase = getSupabaseAdmin();
  const rows = exigerData(
    await supabase.from("affectations").select("lot_affectation_id, cours_id, prof_id, semaine").not("lot_affectation_id", "is", null),
    "lots: affectations",
  );
  // Jour de chaque cours pour calculer la date réelle d'une séance (semaine + jour).
  const coursIds = [...new Set((rows ?? []).map((a) => a.cours_id as string))];
  const coursRows = coursIds.length
    ? (exigerData(await supabase.from("cours").select("id, jour_semaine").in("id", coursIds), "lots: cours") ?? [])
    : [];
  const jourById = new Map(coursRows.map((c) => [c.id as string, (c.jour_semaine as number | null) ?? 1]));
  const today = partiesParis(new Date()).iso;
  const estFuture = (coursId: string, semaine: string) =>
    toISODate(dateDuJour(semaine, jourById.get(coursId) ?? 1)) >= today;

  type CoursAgg = { coursId: string; nb: number; nbFutures: number };
  type LotAgg = {
    lot: string; nb: number; nbFutures: number;
    coursIds: Set<string>; profIds: Set<string>; min: string; max: string;
    parCours: Map<string, CoursAgg>;
  };
  const map = new Map<string, LotAgg>();
  for (const a of rows ?? []) {
    const lot = a.lot_affectation_id as string;
    const coursId = a.cours_id as string;
    const semaine = a.semaine as string;
    const future = estFuture(coursId, semaine);
    const g = map.get(lot) ?? { lot, nb: 0, nbFutures: 0, coursIds: new Set<string>(), profIds: new Set<string>(), min: semaine, max: semaine, parCours: new Map<string, CoursAgg>() };
    g.nb++;
    if (future) g.nbFutures++;
    g.coursIds.add(coursId);
    g.profIds.add(a.prof_id as string);
    if (semaine < g.min) g.min = semaine;
    if (semaine > g.max) g.max = semaine;
    const c = g.parCours.get(coursId) ?? { coursId, nb: 0, nbFutures: 0 };
    c.nb++;
    if (future) c.nbFutures++;
    g.parCours.set(coursId, c);
    map.set(lot, g);
  }
  const lots = [...map.values()]
    .map((g) => ({
      lot: g.lot, nb: g.nb, nbFutures: g.nbFutures,
      coursIds: [...g.coursIds], profIds: [...g.profIds],
      premiereSemaine: g.min, derniereSemaine: g.max,
      parCours: [...g.parCours.values()],
    }))
    .sort((a, b) => b.derniereSemaine.localeCompare(a.derniereSemaine));
  return NextResponse.json({ lots });
}
