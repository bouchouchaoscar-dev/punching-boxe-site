import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// PUT — modifier un template (par défaut ou personnalisé).
export async function PUT(request: Request, { params }: Ctx) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  const { id } = await params;
  let body: { nom?: string; objet?: string; contenu?: string; categorie?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.nom !== undefined) update.nom = String(body.nom);
  if (body.objet !== undefined) update.objet = String(body.objet);
  if (body.contenu !== undefined) update.contenu = String(body.contenu);
  if (body.categorie !== undefined) update.categorie = body.categorie || null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("templates_mail")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

// DELETE — supprimer un template (interdit pour les templates par défaut).
export async function DELETE(request: Request, { params }: Ctx) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: t } = await supabase
    .from("templates_mail")
    .select("est_defaut")
    .eq("id", id)
    .maybeSingle();
  if (t?.est_defaut) {
    return NextResponse.json(
      { error: "Les templates par défaut ne peuvent pas être supprimés." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("templates_mail").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
