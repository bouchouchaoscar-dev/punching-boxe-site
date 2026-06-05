import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET — détail d'un adhérent.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ adherent: data });
}

// PATCH — mise à jour (ex : confirmer un paiement en espèces).
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  // Liste blanche des champs modifiables depuis l'admin.
  const allowed = [
    "statut_paiement",
    "mode_paiement",
    "nom",
    "prenom",
    "email",
    "telephone",
    "adresse",
    "ville",
    "code_postal",
    "option_prepa_physique",
    "nb_membres_famille",
    "documents_valides",
  ];
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) update[k] = body[k];
  }

  if (body.action === "confirmer_especes") {
    update.statut_paiement = "confirme_especes";
  }
  if (body.action === "valider_documents") {
    update.documents_valides = true;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("adherents")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ adherent: data });
}
