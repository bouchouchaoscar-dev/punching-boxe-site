import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { presenceActif, coursOuverts, rattacherCours, partiesParis } from "@/lib/presence";
import { chargerPlanning, profilDossier, type DossierPresence } from "@/lib/presence-server";
import { autoriser, ipDe } from "@/lib/rate-limit";
import { coursPublic } from "@/lib/presence-server";

export const runtime = "nodejs";

// POST /api/presence/pointer — { dossierId, coursId?, salle? }
// Rattache un adhérent au cours ouvert (auto si un seul compatible, sinon choix)
// puis enregistre la présence (idempotent : re-pointer = pas de doublon).
export async function POST(request: Request) {
  if (!presenceActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!autoriser(`pres-point:${ipDe(request)}`, 60, 60_000))
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Indisponible." }, { status: 503 });

  let body: { dossierId?: string; coursId?: string; salle?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const dossierId = (body.dossierId || "").trim();
  if (!dossierId) return NextResponse.json({ error: "Adhérent requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: dossier } = await supabase
    .from("adherents")
    .select("id, prenom, nom, date_naissance, package, option_prepa_physique, annule_at")
    .eq("id", dossierId)
    .is("annule_at", null)
    .maybeSingle();
  if (!dossier) return NextResponse.json({ error: "Adhérent introuvable." }, { status: 404 });

  const { cours, periodes } = await chargerPlanning(supabase);
  const now = new Date();
  const ouverts = coursOuverts(now, { cours, periodes, salle: body.salle || undefined });
  if (ouverts.length === 0)
    return NextResponse.json({ error: "Aucun cours en ce moment." }, { status: 400 });

  const profil = profilDossier(dossier as DossierPresence);
  const nowMin = partiesParis(now).minutes;

  // Cours choisi explicitement (2e appel) ou rattachement.
  let cible = body.coursId ? ouverts.find((o) => o.cours.id === body.coursId) : undefined;
  if (!cible) {
    const r = rattacherCours(ouverts, profil, nowMin);
    if (r.mode === "choix") {
      return NextResponse.json({ choix: r.cours.map(coursPublic), selectionId: r.selectionId });
    }
    cible = r.cours[0]; // auto
  }
  if (!cible) return NextResponse.json({ error: "Cours indisponible." }, { status: 400 });

  const { error } = await supabase.from("presences").insert({
    cours_id: cible.cours.id,
    date_seance: cible.dateISO,
    dossier_id: dossierId,
    source: "qr",
  });
  // 23505 = déjà pointé pour ce cours ce jour → succès idempotent.
  if (error && error.code !== "23505")
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });

  return NextResponse.json({ ok: true, coursLabel: cible.cours.libelle, horaire: cible.horaire });
}
