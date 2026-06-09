import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { DEFAULT_TEMPLATES } from "@/lib/campagnes";

export const runtime = "nodejs";

// GET — liste des templates (insère les 5 templates par défaut s'ils manquent).
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ templates: [] });

  const supabase = getSupabaseAdmin();

  // Seed des templates par défaut absents (par nom).
  const { data: existing } = await supabase
    .from("templates_mail")
    .select("nom, categorie");
  const noms = new Set((existing ?? []).map((t) => t.nom));
  const manquants = DEFAULT_TEMPLATES.filter((t) => !noms.has(t.nom)).map((t) => ({
    ...t,
    est_defaut: true,
  }));
  if (manquants.length > 0) {
    const { error: insErr } = await supabase.from("templates_mail").insert(manquants);
    // Tolérance : colonne categorie pas encore créée → insert sans elle.
    if (insErr && /categorie/.test(insErr.message)) {
      await supabase.from("templates_mail").insert(
        manquants.map(({ categorie: _c, ...rest }) => rest),
      );
    }
  }

  // Backfill catégorie des défauts existants (par nom) si manquante.
  for (const t of DEFAULT_TEMPLATES) {
    const ex = (existing ?? []).find((e) => e.nom === t.nom);
    if (ex && !ex.categorie) {
      await supabase
        .from("templates_mail")
        .update({ categorie: t.categorie })
        .eq("nom", t.nom)
        .then(undefined, () => {}); // ignore si colonne absente
    }
  }

  const { data, error } = await supabase
    .from("templates_mail")
    .select("*")
    .order("est_defaut", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

// POST — créer un template personnalisé.
export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  let body: { nom?: string; objet?: string; contenu?: string; categorie?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (!body.nom?.trim()) {
    return NextResponse.json({ error: "Nom du template requis." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("templates_mail")
    .insert({
      nom: body.nom.trim(),
      objet: String(body.objet || ""),
      contenu: String(body.contenu || ""),
      categorie: body.categorie || null,
      est_defaut: false,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data }, { status: 201 });
}
