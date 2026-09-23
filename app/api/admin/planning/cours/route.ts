import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif, DISCIPLINES_COURS } from "@/lib/planning";

export const runtime = "nodejs";

const TYPES = ["adulte", "jeune"];
const DISCIPLINES = DISCIPLINES_COURS.map((d) => d.cle) as string[];

// Normalise une heure "HH:MM" ; renvoie null si vide/invalide.
function optHeure(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{2}:\d{2}$/.test(s) ? s : null;
}
// Liste de jours (1..7) dédupliquée à partir de `jours` (tableau) ou `jour_semaine`.
function lireJours(body: Record<string, unknown>): number[] {
  const src = Array.isArray(body.jours)
    ? body.jours
    : body.jour_semaine !== undefined
      ? [body.jour_semaine]
      : [];
  const set = new Set<number>();
  for (const j of src) {
    const n = Number(j);
    if (n >= 1 && n <= 7) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

// GET — liste des cours (tri jour puis heure).
export async function GET(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ cours: [] });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("cours")
    .select("*")
    .order("jour_semaine", { ascending: true })
    .order("heure_debut", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cours: data ?? [] });
}

// POST — créer un ou PLUSIEURS cours récurrents (un par jour coché), même
// libellé/horaire/formule/public/salle/ville. Formule + public OBLIGATOIRES.
export async function POST(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const libelle = String(body.libelle ?? "").trim();
  const jours = lireJours(body);
  const heureDebut = optHeure(body.heure_debut);
  const heureFin = optHeure(body.heure_fin);
  const type = String(body.type_adherent ?? "").trim();
  const discipline = String(body.discipline ?? "").trim();

  if (!libelle) return NextResponse.json({ error: "Libellé requis." }, { status: 400 });
  if (!DISCIPLINES.includes(discipline)) return NextResponse.json({ error: "Discipline requise." }, { status: 400 });
  if (!TYPES.includes(type)) return NextResponse.json({ error: "Public requis (adultes ou jeunes)." }, { status: 400 });
  if (jours.length === 0) return NextResponse.json({ error: "Sélectionnez au moins un jour." }, { status: 400 });
  if (!heureDebut || !heureFin) return NextResponse.json({ error: "Horaires requis." }, { status: 400 });
  if (heureFin <= heureDebut) return NextResponse.json({ error: "L'heure de fin doit suivre le début." }, { status: 400 });

  const lignes = jours.map((j) => ({
    libelle,
    discipline,
    type_adherent: type,
    jour_semaine: j,
    heure_debut: heureDebut,
    heure_fin: heureFin,
    salle: String(body.salle ?? "").trim() || null,
    ville: String(body.ville ?? "").trim() || null,
  }));

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("cours").insert(lignes).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cours: data ?? [], crees: (data ?? []).length });
}

// PATCH — éditer / (dés)activer un cours (id dans le corps). Édition d'un seul
// cours (un jour) — la création multi-jours reste réservée au POST.
export async function PATCH(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Identifiant requis." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.libelle !== undefined) {
    const l = String(body.libelle).trim();
    if (!l) return NextResponse.json({ error: "Libellé requis." }, { status: 400 });
    patch.libelle = l;
  }
  if (body.discipline !== undefined) {
    const d = String(body.discipline).trim();
    if (!DISCIPLINES.includes(d)) return NextResponse.json({ error: "Discipline invalide." }, { status: 400 });
    patch.discipline = d;
  }
  if (body.type_adherent !== undefined) {
    const t = String(body.type_adherent).trim();
    if (!TYPES.includes(t)) return NextResponse.json({ error: "Public requis (adultes ou jeunes)." }, { status: 400 });
    patch.type_adherent = t;
  }
  if (body.jour_semaine !== undefined) {
    const j = Number(body.jour_semaine);
    if (!(j >= 1 && j <= 7)) return NextResponse.json({ error: "Jour invalide." }, { status: 400 });
    patch.jour_semaine = j;
  }
  if (body.heure_debut !== undefined) patch.heure_debut = optHeure(body.heure_debut);
  if (body.heure_fin !== undefined) patch.heure_fin = optHeure(body.heure_fin);
  if (
    patch.heure_debut && patch.heure_fin &&
    (patch.heure_fin as string) <= (patch.heure_debut as string)
  ) {
    return NextResponse.json({ error: "L'heure de fin doit suivre le début." }, { status: 400 });
  }
  if (body.salle !== undefined) patch.salle = String(body.salle).trim() || null;
  if (body.ville !== undefined) patch.ville = String(body.ville).trim() || null;
  if (body.actif !== undefined) patch.actif = !!body.actif;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("cours")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cours: data });
}
