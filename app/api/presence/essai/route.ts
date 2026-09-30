import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { presenceActif, coursOuverts, rattacherCours, partiesParis } from "@/lib/presence";
import {
  chargerPlanning,
  dossiersSaison,
  profilDossier,
  trouverDossierCorrespondant,
  attacherPresenceEssai,
  coursPublic,
} from "@/lib/presence-server";
import { estEmailValide, normaliserEmail } from "@/lib/email-format";
import { estMineur } from "@/lib/pricing";
import { saisonCourante } from "@/lib/saison";
import { autoriser, ipDe } from "@/lib/rate-limit";

export const runtime = "nodejs";

// POST /api/presence/essai — { prenom, nom, date_naissance, email, coursId?, salle? }
// Séance d'essai. Si l'email OU le triplet correspond déjà à un dossier de la
// saison → on enregistre une présence sur le dossier (pas un essai). Anti-doublon
// essai : même email + même cours + même date → réutilise l'essai (une seule
// série de relances).
export async function POST(request: Request) {
  if (!presenceActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!autoriser(`pres-essai:${ipDe(request)}`, 30, 60_000))
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Indisponible." }, { status: 503 });

  let body: {
    prenom?: string;
    nom?: string;
    date_naissance?: string;
    email?: string;
    coursId?: string;
    salle?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const prenom = (body.prenom || "").trim();
  const nom = (body.nom || "").trim();
  const date_naissance = (body.date_naissance || "").trim();
  const email = normaliserEmail(body.email);
  if (!prenom || !nom) return NextResponse.json({ error: "Prénom et nom requis." }, { status: 400 });
  if (!date_naissance) return NextResponse.json({ error: "Date de naissance requise." }, { status: 400 });
  if (!estEmailValide(email)) return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { cours, periodes } = await chargerPlanning(supabase);
  const now = new Date();
  const ouverts = coursOuverts(now, { cours, periodes, salle: body.salle || undefined });
  if (ouverts.length === 0)
    return NextResponse.json({ error: "Aucun cours en ce moment." }, { status: 400 });
  const nowMin = partiesParis(now).minutes;

  // Rattachement au cours ouvert : profil du dossier si correspondance (public +
  // discipline), sinon profil essayeur (par l'âge, toutes disciplines).
  const dossiers = await dossiersSaison(supabase, saisonCourante(new Date()));
  const dossier = trouverDossierCorrespondant(dossiers, { email, nom, prenom, date_naissance });
  const profil = dossier ? profilDossier(dossier) : { mineur: estMineur(date_naissance), essai: true };

  let cible = body.coursId ? ouverts.find((o) => o.cours.id === body.coursId) : undefined;
  if (!cible) {
    const r = rattacherCours(ouverts, profil, nowMin);
    if (r.mode === "choix") return NextResponse.json({ choix: r.cours.map(coursPublic), selectionId: r.selectionId });
    cible = r.cours[0];
  }
  if (!cible) return NextResponse.json({ error: "Cours indisponible." }, { status: 400 });

  // Insertion (dossier ou essai) via la logique partagée (source unique).
  const res = await attacherPresenceEssai(supabase, {
    coursId: cible.cours.id,
    dateSeance: cible.dateISO,
    prenom,
    nom,
    date_naissance,
    email,
    source: "qr",
    dossiers,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({
    ok: true,
    coursLabel: cible.cours.libelle,
    surDossier: res.surDossier,
    essai: !res.surDossier,
    dejaUtilise: res.dejaUtilise ?? false,
    dateEssai: res.dateEssai ?? null,
  });
}
