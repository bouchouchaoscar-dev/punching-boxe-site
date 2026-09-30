import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { presenceActif, coursOuverts, rattacherCours, partiesParis } from "@/lib/presence";
import {
  chargerPlanning,
  dossiersSaison,
  profilDossier,
  trouverDossierCorrespondant,
} from "@/lib/presence-server";
import { estEmailValide, normaliserEmail } from "@/lib/email-format";
import { estMineur } from "@/lib/pricing";
import { saisonCourante } from "@/lib/saison";
import { autoriser, ipDe } from "@/lib/rate-limit";
import { coursPublic } from "@/lib/presence-server";

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

  // Correspond déjà à un dossier de la saison ? → présence sur le dossier.
  const dossiers = await dossiersSaison(supabase, saisonCourante(new Date()));
  const dossier = trouverDossierCorrespondant(dossiers, { email, nom, prenom, date_naissance });
  if (dossier) {
    let cible = body.coursId ? ouverts.find((o) => o.cours.id === body.coursId) : undefined;
    if (!cible) {
      const r = rattacherCours(ouverts, profilDossier(dossier), nowMin);
      if (r.mode === "choix") return NextResponse.json({ choix: r.cours.map(coursPublic), selectionId: r.selectionId });
      cible = r.cours[0];
    }
    if (!cible) return NextResponse.json({ error: "Cours indisponible." }, { status: 400 });
    const { error } = await supabase.from("presences").insert({
      cours_id: cible.cours.id,
      date_seance: cible.dateISO,
      dossier_id: dossier.id,
      source: "qr",
    });
    if (error && error.code !== "23505") return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
    return NextResponse.json({ ok: true, coursLabel: cible.cours.libelle, surDossier: true });
  }

  // Essayeur : rattachement par l'âge (toutes disciplines).
  let cible = body.coursId ? ouverts.find((o) => o.cours.id === body.coursId) : undefined;
  if (!cible) {
    const r = rattacherCours(ouverts, { mineur: estMineur(date_naissance), essai: true }, nowMin);
    if (r.mode === "choix") return NextResponse.json({ choix: r.cours.map(coursPublic), selectionId: r.selectionId });
    cible = r.cours[0];
  }
  if (!cible) return NextResponse.json({ error: "Cours indisponible." }, { status: 400 });

  // Anti-doublon : essai existant (même email + cours + date) → réutilisé.
  const { data: existant } = await supabase
    .from("essais")
    .select("id")
    .eq("email", email)
    .eq("cours_id", cible.cours.id)
    .eq("date_seance", cible.dateISO)
    .maybeSingle();

  let essaiId = existant?.id as string | undefined;
  if (!essaiId) {
    const { data: cree, error: eEssai } = await supabase
      .from("essais")
      .insert({ nom, prenom, date_naissance, email, cours_id: cible.cours.id, date_seance: cible.dateISO })
      .select("id")
      .single();
    if (eEssai || !cree) return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
    essaiId = cree.id;
  }

  const { error } = await supabase.from("presences").insert({
    cours_id: cible.cours.id,
    date_seance: cible.dateISO,
    essai_id: essaiId,
    source: "qr",
  });
  if (error && error.code !== "23505") return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });

  return NextResponse.json({ ok: true, coursLabel: cible.cours.libelle, essai: true });
}
