import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif } from "@/lib/planning";

export const runtime = "nodejs";

// GET — liste des profs (tri par nom).
export async function GET(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ profs: [] });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profs")
    .select("*")
    .order("nom", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profs: data ?? [] });
}

// POST — créer un prof.
export async function POST(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { nom?: string; prenom?: string; email?: string; telephone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const nom = (body.nom || "").trim();
  const prenom = (body.prenom || "").trim();
  if (!nom && !prenom) {
    return NextResponse.json({ error: "Nom ou prénom requis." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profs")
    .insert({
      nom,
      prenom,
      email: (body.email || "").trim() || null,
      telephone: (body.telephone || "").trim() || null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prof: data });
}

// PATCH — éditer / (dés)activer un prof (id dans le corps).
export async function PATCH(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: {
    id?: string;
    nom?: string;
    prenom?: string;
    email?: string;
    telephone?: string;
    actif?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const id = (body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Identifiant requis." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.nom !== undefined) patch.nom = body.nom.trim();
  if (body.prenom !== undefined) patch.prenom = body.prenom.trim();
  if (body.email !== undefined) patch.email = body.email.trim() || null;
  if (body.telephone !== undefined) patch.telephone = body.telephone.trim() || null;
  if (body.actif !== undefined) patch.actif = !!body.actif;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profs")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prof: data });
}
