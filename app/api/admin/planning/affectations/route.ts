import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { sendProfNotification } from "@/lib/email";
import { planningActif, jourLong, formatHeure, type Cours, type Prof } from "@/lib/planning";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET — affectations d'une semaine (?semaine=YYYY-MM-DD, lundi).
export async function GET(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ affectations: [] });

  const semaine = new URL(request.url).searchParams.get("semaine") || "";
  if (!ISO.test(semaine)) {
    return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("affectations")
    .select("*")
    .eq("semaine", semaine);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ affectations: data ?? [] });
}

// POST — affecter (ou ré-affecter) un prof à un cours pour une semaine, puis
// notifier le prof par email. Upsert sur la contrainte unique (cours_id, semaine).
export async function POST(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { cours_id?: string; prof_id?: string | null; semaine?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const coursId = (body.cours_id || "").trim();
  const profId = (body.prof_id || "").trim() || null;
  const semaine = (body.semaine || "").trim();
  if (!coursId) return NextResponse.json({ error: "Cours requis." }, { status: 400 });
  if (!ISO.test(semaine)) return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // Upsert sur (cours_id, semaine) : ré-affecter écrase le prof précédent.
  const { data: aff, error } = await supabase
    .from("affectations")
    .upsert(
      { cours_id: coursId, prof_id: profId, semaine, statut: "prevu" },
      { onConflict: "cours_id,semaine" },
    )
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notification du prof affecté (best-effort : jamais bloquant pour l'affectation).
  let mail: "envoye" | "sans_email" | "erreur" | "aucun_prof" = "aucun_prof";
  if (profId) {
    const [{ data: cours }, { data: prof }] = await Promise.all([
      supabase.from("cours").select("*").eq("id", coursId).maybeSingle(),
      supabase.from("profs").select("*").eq("id", profId).maybeSingle(),
    ]);
    const c = cours as Cours | null;
    const p = prof as Prof | null;
    if (c && p) {
      if (!p.email) {
        mail = "sans_email";
      } else {
        try {
          const horaire = `${formatHeure(c.heure_debut)} – ${formatHeure(c.heure_fin)}`;
          const res = await sendProfNotification({
            email: p.email,
            prenomProf: p.prenom,
            coursLibelle: c.libelle || "Cours",
            jour: jourLong(c.jour_semaine),
            horaire,
            salle: c.salle,
            ville: c.ville,
            semaineISO: semaine,
          });
          mail = "skipped" in res && res.skipped ? "sans_email" : "envoye";
        } catch (e) {
          console.error("sendProfNotification:", e);
          mail = "erreur";
        }
      }
    }
  }

  return NextResponse.json({ affectation: aff, mail });
}
