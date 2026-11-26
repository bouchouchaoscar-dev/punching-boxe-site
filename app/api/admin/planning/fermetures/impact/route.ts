import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif, joursImpactesFermeture, seancesSurJours, type PeriodeFermeture } from "@/lib/planning";

export const runtime = "nodejs";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// POST — aperçu de l'IMPACT (lecture seule) d'une modification ou suppression de
// fermeture, calculé côté serveur. { id, date_debut?, date_fin?, suppression? }
//   - modification : nouvelle plage = (date_debut, date_fin) ;
//   - suppression  : nouvelle plage = aucune (tous les jours redeviennent ouverts).
// Aucune donnée n'est écrite. Admin only, fail-closed.
export async function POST(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { id?: string; date_debut?: string; date_fin?: string; suppression?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Corps invalide." }, { status: 400 }); }
  const id = (body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Identifiant requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const periodes = (exigerData(
    await supabase.from("periodes_fermeture").select("*"),
    "impact fermeture: périodes",
  ) ?? []) as PeriodeFermeture[];
  const courante = periodes.find((p) => p.id === id);
  if (!courante) return NextResponse.json({ error: "Fermeture introuvable." }, { status: 404 });

  const ancien = { debut: courante.date_debut, fin: courante.date_fin };
  let nouveau: { debut: string; fin: string } | null = null;
  if (!body.suppression) {
    const dd = (body.date_debut || "").trim();
    const df = (body.date_fin || "").trim();
    if (!ISO.test(dd) || !ISO.test(df)) return NextResponse.json({ error: "Dates invalides." }, { status: 400 });
    if (df < dd) return NextResponse.json({ error: "La date de fin précède le début." }, { status: 400 });
    nouveau = { debut: dd, fin: df };
  }
  const autres = periodes.filter((p) => p.id !== id);
  const { deviennentFermes, redeviennentOuverts } = joursImpactesFermeture(ancien, nouveau, autres);

  // Cours récurrents (les ponctuelles sont exclues par seancesSurJours).
  const cours = (exigerData(
    await supabase.from("cours").select("id, jour_semaine, date_unique").eq("actif", true),
    "impact fermeture: cours",
  ) ?? []) as { id: string; jour_semaine: number | null; date_unique: string | null }[];

  const fermees = seancesSurJours(deviennentFermes, cours);
  const ouvertes = seancesSurJours(redeviennentOuverts, cours);

  // Combien de séances « deviennent fermées » ont un prof affecté / des présences.
  let avecProf = 0;
  let avecPresences = 0;
  if (fermees.length) {
    const coursIds = [...new Set(fermees.map((s) => s.coursId))];
    const semaines = [...new Set(fermees.map((s) => s.semaine))];
    const dates = [...new Set(fermees.map((s) => s.date))];
    const affs = exigerData(
      await supabase.from("affectations").select("cours_id, semaine, prof_id").in("cours_id", coursIds).in("semaine", semaines).not("prof_id", "is", null),
      "impact fermeture: affectations",
    );
    const avecProfSet = new Set((affs ?? []).map((a) => `${a.cours_id}|${a.semaine}`));
    const pres = exigerData(
      await supabase.from("presences").select("cours_id, date_seance").in("cours_id", coursIds).in("date_seance", dates),
      "impact fermeture: présences",
    );
    const avecPresSet = new Set((pres ?? []).map((p) => `${p.cours_id}|${p.date_seance}`));
    avecProf = fermees.filter((s) => avecProfSet.has(`${s.coursId}|${s.semaine}`)).length;
    avecPresences = fermees.filter((s) => avecPresSet.has(`${s.coursId}|${s.date}`)).length;
  }

  return NextResponse.json({
    deviennentFermees: { seances: fermees.length, avecProf, avecPresences },
    redeviennentOuvertes: { seances: ouvertes.length },
  }, { headers: { "Cache-Control": "no-store" } });
}
