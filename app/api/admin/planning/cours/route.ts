import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif } from "@/lib/planning";

export const runtime = "nodejs";

const PACKAGES = ["boxe_classique", "savate_prepa"];
const TYPES = ["adulte", "jeune"];

// Normalise un champ optionnel (package / type_adherent) : "" → null.
function optEnum(v: unknown, allowed: string[]): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return allowed.includes(s) ? s : null;
}
// Normalise une heure "HH:MM" → "HH:MM"; renvoie null si vide/invalide.
function optHeure(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{2}:\d{2}$/.test(s) ? s : null;
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

// POST — créer un cours récurrent.
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
  const jour = Number(body.jour_semaine);
  const heureDebut = optHeure(body.heure_debut);
  const heureFin = optHeure(body.heure_fin);
  if (!libelle) return NextResponse.json({ error: "Libellé requis." }, { status: 400 });
  if (!(jour >= 1 && jour <= 7)) return NextResponse.json({ error: "Jour invalide." }, { status: 400 });
  if (!heureDebut || !heureFin) return NextResponse.json({ error: "Horaires requis." }, { status: 400 });
  if (heureFin <= heureDebut) return NextResponse.json({ error: "L'heure de fin doit suivre le début." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("cours")
    .insert({
      libelle,
      package: optEnum(body.package, PACKAGES),
      type_adherent: optEnum(body.type_adherent, TYPES),
      jour_semaine: jour,
      heure_debut: heureDebut,
      heure_fin: heureFin,
      salle: String(body.salle ?? "").trim() || null,
      ville: String(body.ville ?? "").trim() || null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cours: data });
}

// PATCH — éditer / (dés)activer un cours (id dans le corps).
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
  if (body.libelle !== undefined) patch.libelle = String(body.libelle).trim();
  if (body.package !== undefined) patch.package = optEnum(body.package, PACKAGES);
  if (body.type_adherent !== undefined) patch.type_adherent = optEnum(body.type_adherent, TYPES);
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
