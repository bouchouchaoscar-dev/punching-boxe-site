import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { presenceActif } from "@/lib/presence";
import { attacherPresenceEssai } from "@/lib/presence-server";
import { estEmailValide, normaliserEmail } from "@/lib/email-format";

export const runtime = "nodejs";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/admin/presence/essai — ajout d'une séance d'essai depuis l'admin sur
// un cours DÉJÀ CHOISI dans la vue (source 'manuel', pas de recalcul par l'heure).
// Mêmes règles que la route publique (source unique attacherPresenceEssai) :
// anti-doublon, rattachement au dossier si correspondance, relances J+1/J+7.
export async function POST(request: Request) {
  if (!presenceActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Indisponible." }, { status: 503 });

  let body: { coursId?: string; date?: string; prenom?: string; nom?: string; date_naissance?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const coursId = (body.coursId || "").trim();
  const date = (body.date || "").trim();
  const prenom = (body.prenom || "").trim();
  const nom = (body.nom || "").trim();
  const date_naissance = (body.date_naissance || "").trim();
  const email = normaliserEmail(body.email);
  if (!coursId || !ISO.test(date)) return NextResponse.json({ error: "Cours et date requis." }, { status: 400 });
  if (!prenom || !nom) return NextResponse.json({ error: "Prénom et nom requis." }, { status: 400 });
  if (!date_naissance) return NextResponse.json({ error: "Date de naissance requise." }, { status: 400 });
  if (!estEmailValide(email)) return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const res = await attacherPresenceEssai(supabase, {
    coursId,
    dateSeance: date,
    prenom,
    nom,
    date_naissance,
    email,
    source: "manuel",
    createdBy: "admin",
  });
  if (!res.ok) {
    // Filet FK (cours supprimé entre-temps) → message lisible, pas de 500 brut.
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, surDossier: res.surDossier });
}
