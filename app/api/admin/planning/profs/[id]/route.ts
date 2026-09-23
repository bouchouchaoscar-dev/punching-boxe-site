import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif, lundiDeLaSemaine, toISODate, dureeHeures, MSG_PROF_HISTORIQUE } from "@/lib/planning";

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

// GET — état d'un prof pour piloter les modales : historique (passé/en cours),
// futures, total d'heures passées/en cours, et s'il a déjà reçu un planning
// pour une semaine en cours/à venir (il ne sera pas prévenu de son retrait).
export async function GET(request: Request, { params }: Ctx) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ historique: 0, futures: 0, heures: 0, dejaEnvoye: false });
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { historique, futures, lundiCourant } = await compter(supabase, id);

  // Heures passées/en cours (jointure cours pour la durée).
  const { data: affHist } = await supabase
    .from("affectations")
    .select("cours(heure_debut, heure_fin)")
    .eq("prof_id", id)
    .lte("semaine", lundiCourant);
  let heures = 0;
  for (const a of (affHist ?? []) as unknown as {
    cours: { heure_debut: string | null; heure_fin: string | null } | null;
  }[]) {
    if (a.cours) heures += dureeHeures(a.cours.heure_debut, a.cours.heure_fin);
  }

  const { count: envCount } = await supabase
    .from("envois_planning")
    .select("id", { count: "exact", head: true })
    .eq("prof_id", id)
    .gte("semaine", lundiCourant);

  return NextResponse.json({
    historique,
    futures,
    heures: Math.round(heures * 10) / 10,
    dejaEnvoye: (envCount ?? 0) > 0,
  });
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
  await supabase.from("affectations").delete().eq("prof_id", id).gt("semaine", lundiCourant);
  const { error } = await supabase.from("profs").update({ actif: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, futures });
}

// DELETE — supprimer un prof. Autorisé même avec historique, mais SEULEMENT si la
// requête confirme explicitement la perte (confirmer_perte_historique=true) ;
// sinon 409 (invite à archiver). La FK reste ON DELETE RESTRICT (filet en base) :
// on efface d'abord TOUTES ses affectations, puis le prof (envois_planning cascade).
export async function DELETE(request: Request, { params }: Ctx) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Identifiant requis." }, { status: 400 });

  let body: { confirmer_perte_historique?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    /* corps optionnel */
  }

  const supabase = getSupabaseAdmin();
  const { historique, futures } = await compter(supabase, id);

  if (historique > 0 && body.confirmer_perte_historique !== true) {
    return NextResponse.json(
      { error: MSG_PROF_HISTORIQUE, code: "historique", historique, futures },
      { status: 409 },
    );
  }

  // Efface toutes les affectations (RESTRICT) puis le prof.
  const { error: eAff } = await supabase.from("affectations").delete().eq("prof_id", id);
  if (eAff) {
    console.error("Suppression affectations prof:", eAff);
    return NextResponse.json({ error: "Impossible de retirer les affectations du prof." }, { status: 500 });
  }
  const { error: eProf } = await supabase.from("profs").delete().eq("id", id);
  if (eProf) {
    console.error("Suppression prof:", eProf);
    return NextResponse.json({ error: "Les affectations ont été retirées mais la suppression du prof a échoué." }, { status: 500 });
  }
  return NextResponse.json({ success: true, historique, futures });
}
