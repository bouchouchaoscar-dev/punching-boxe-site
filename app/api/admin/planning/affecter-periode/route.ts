import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif, genererSeancesPeriode, dateDuJour, toISODate, formatDateCours, plageHoraire, jourLong, type Cours, type PeriodeFermeture } from "@/lib/planning";
import { partiesParis } from "@/lib/presence";
import { sendAffectationPeriode } from "@/lib/email";

export const runtime = "nodejs";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function chargerContexte(supabase: ReturnType<typeof getSupabaseAdmin>, coursIds: string[]) {
  const cours = (exigerData(
    await supabase.from("cours").select("id, libelle, discipline, type_adherent, jour_semaine, heure_debut, heure_fin, date_unique").in("id", coursIds),
    "affecter-période: cours",
  ) ?? []) as Cours[];
  const periodes = (exigerData(
    await supabase.from("periodes_fermeture").select("*"),
    "affecter-période: périodes",
  ) ?? []) as PeriodeFermeture[];
  return { cours, periodes };
}

// POST — { action:'apercu'|'appliquer', coursIds[], profIds[], debut, fin, remplacer }
export async function POST(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { action?: string; coursIds?: string[]; profIds?: string[]; debut?: string; fin?: string; remplacer?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Corps invalide." }, { status: 400 }); }
  const coursIds = [...new Set((body.coursIds ?? []).filter(Boolean))];
  const profIds = [...new Set((body.profIds ?? []).filter(Boolean))];
  const debut = (body.debut || "").trim();
  const fin = (body.fin || "").trim();
  const remplacer = !!body.remplacer;
  if (!coursIds.length) return NextResponse.json({ error: "Sélectionnez au moins un cours." }, { status: 400 });
  if (!ISO.test(debut) || !ISO.test(fin)) return NextResponse.json({ error: "Dates invalides." }, { status: 400 });
  if (debut > fin) return NextResponse.json({ error: "La date de début doit précéder la date de fin." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { cours, periodes } = await chargerContexte(supabase, coursIds);
  const seances = genererSeancesPeriode(cours, debut, fin, periodes);

  // Conflits : séances (cours|semaine) ayant DÉJÀ une affectation (tout prof).
  const semaines = [...new Set(seances.map((s) => s.semaine))];
  const dejaSet = new Set<string>();
  if (semaines.length) {
    const aff = exigerData(
      await supabase.from("affectations").select("cours_id, semaine").in("cours_id", coursIds).in("semaine", semaines),
      "affecter-période: affectations existantes",
    );
    for (const a of aff ?? []) dejaSet.add(`${a.cours_id}|${a.semaine}`);
  }
  // Séances uniques (une par cours|semaine) + marquage conflit.
  const uniques = [...new Map(seances.map((s) => [`${s.coursId}|${s.semaine}`, s])).values()];
  const deja = uniques.filter((s) => dejaSet.has(`${s.coursId}|${s.semaine}`)).length;

  if (body.action !== "appliquer") {
    return NextResponse.json({ seancesTotal: uniques.length, deja, profs: profIds.length });
  }
  if (!profIds.length) return NextResponse.json({ error: "Sélectionnez au moins un prof." }, { status: 400 });

  // Écriture : conserver → seulement les séances libres ; remplacer → toutes.
  const aAffecter = remplacer ? uniques : uniques.filter((s) => !dejaSet.has(`${s.coursId}|${s.semaine}`));
  const lot = crypto.randomUUID();
  let inserees = 0;
  if (aAffecter.length) {
    const { data, error } = await supabase.rpc("appliquer_affectations_lot", {
      p_pairs: aAffecter.map((s) => ({ c: s.coursId, s: s.semaine })),
      p_profs: profIds,
      p_lot: lot,
      p_remplacer: remplacer,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserees = Number(data) || 0;
  }

  // Mails : UN SEUL par prof, séances d'AUJOURD'HUI et FUTURES uniquement.
  const today = partiesParis(new Date()).iso;
  const futures = aAffecter
    .map((s) => ({ ...s, date: toISODate(dateDuJour(s.semaine, (cours.find((c) => c.id === s.coursId)?.jour_semaine) ?? 1)) }))
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  let mailsEnvoyes = 0;
  if (futures.length) {
    const coursListe = [...new Set(futures.map((s) => s.coursId))].map((id) => {
      const c = cours.find((x) => x.id === id)!;
      return { libelle: c.libelle ?? "Cours", jour: jourLong(c.jour_semaine), horaire: plageHoraire(c.heure_debut, c.heure_fin) };
    });
    const premiere = formatDateCours(futures[0].date);
    const derniere = formatDateCours(futures[futures.length - 1].date);
    const profsRows = exigerData(await supabase.from("profs").select("id, prenom, email").in("id", profIds), "affecter-période: profs mail");
    for (const p of profsRows ?? []) {
      if (!p.email) continue;
      try {
        await sendAffectationPeriode({ email: p.email as string, prenom: (p.prenom as string) ?? "", cours: coursListe, premiereSeance: premiere, derniereSeance: derniere, nbSeances: futures.length });
        mailsEnvoyes++;
      } catch (e) { console.error("[AFFECTATION PÉRIODE] mail prof échoué:", p.id, e); }
    }
  }

  return NextResponse.json({ ok: true, lot, seancesTotal: uniques.length, deja, inserees, mailsEnvoyes });
}

// DELETE — supprime un lot : entier, restreint à certains COURS du lot, et/ou
// seulement les séances À VENIR. { lotId, coursIds?, futuresSeulement? }
export async function DELETE(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { lotId?: string; coursIds?: string[]; futuresSeulement?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Corps invalide." }, { status: 400 }); }
  const lotId = (body.lotId || "").trim();
  if (!lotId) return NextResponse.json({ error: "lotId requis." }, { status: 400 });
  const coursFiltre = [...new Set((body.coursIds ?? []).filter(Boolean))];
  const futures = !!body.futuresSeulement;

  const supabase = getSupabaseAdmin();

  // Chemin rapide : lot entier (aucun filtre cours, aucun filtre futur).
  if (!futures && coursFiltre.length === 0) {
    const { data, error } = await supabase.from("affectations").delete().eq("lot_affectation_id", lotId).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, supprimees: data?.length ?? 0 });
  }

  // Sinon : on charge les lignes (éventuellement restreintes aux cours choisis),
  // on ne garde que les séances à venir si demandé, puis on supprime par id.
  let q = supabase.from("affectations").select("id, cours_id, semaine").eq("lot_affectation_id", lotId);
  if (coursFiltre.length) q = q.in("cours_id", coursFiltre);
  const rows = exigerData(await q, "suppr lot: lignes");

  let ids = (rows ?? []).map((r) => r.id as string);
  if (futures) {
    const cids = [...new Set((rows ?? []).map((r) => r.cours_id as string))];
    const cours = cids.length ? ((exigerData(await supabase.from("cours").select("id, jour_semaine").in("id", cids), "suppr lot: cours") ?? []) as { id: string; jour_semaine: number | null }[]) : [];
    const jourById = new Map(cours.map((c) => [c.id, c.jour_semaine ?? 1]));
    const today = partiesParis(new Date()).iso;
    ids = (rows ?? [])
      .filter((r) => toISODate(dateDuJour(r.semaine as string, jourById.get(r.cours_id as string) ?? 1)) >= today)
      .map((r) => r.id as string);
  }
  if (!ids.length) return NextResponse.json({ ok: true, supprimees: 0 });
  const { data, error } = await supabase.from("affectations").delete().in("id", ids).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, supprimees: data?.length ?? 0 });
}
