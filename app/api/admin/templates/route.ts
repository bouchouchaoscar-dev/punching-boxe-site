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

  // Seed + synchro des modèles par défaut (par nom).
  // Select résilient : la colonne `personnalise` peut manquer sur une base
  // antérieure à la migration 004. Dans ce cas → comportement historique
  // (insertion des manquants seulement), AUCUNE synchro ni écrasement.
  let existing: {
    id: string;
    nom: string;
    objet: string;
    contenu: string;
    categorie: string | null;
    est_defaut: boolean | null;
    personnalise?: boolean | null;
  }[] = [];
  let colPersonnalise = true;
  {
    const r = await supabase
      .from("templates_mail")
      .select("id, nom, objet, contenu, categorie, est_defaut, personnalise");
    if (r.error && /personnalise/.test(r.error.message)) {
      colPersonnalise = false;
      const r2 = await supabase
        .from("templates_mail")
        .select("id, nom, objet, contenu, categorie, est_defaut");
      existing = (r2.data ?? []) as typeof existing;
    } else {
      existing = (r.data ?? []) as typeof existing;
    }
  }
  const parNom = new Map(existing.map((t) => [t.nom, t]));

  // 1) Insérer les défauts absents.
  const manquants = DEFAULT_TEMPLATES.filter((t) => !parNom.has(t.nom)).map((t) => ({
    ...t,
    est_defaut: true,
    ...(colPersonnalise ? { personnalise: false } : {}),
  }));
  if (manquants.length > 0) {
    const { error: insErr } = await supabase.from("templates_mail").insert(manquants);
    // Tolérance : colonnes categorie/personnalise absentes → insert minimal.
    if (insErr && /(categorie|personnalise)/.test(insErr.message)) {
      await supabase.from("templates_mail").insert(
        manquants.map(({ categorie: _c, personnalise: _p, ...rest }) => rest),
      );
    }
  }

  // 2) Synchroniser les défauts NON personnalisés dont le contenu a changé
  //    (propage les corrections du socle). Jamais les modèles édités par
  //    l'admin (personnalise=true). Ignoré si la colonne n'existe pas encore.
  if (colPersonnalise) {
    for (const t of DEFAULT_TEMPLATES) {
      const ex = parNom.get(t.nom);
      if (!ex || ex.personnalise) continue;
      const differe =
        ex.objet !== t.objet ||
        ex.contenu !== t.contenu ||
        ex.categorie !== t.categorie;
      if (!differe) continue;
      await supabase
        .from("templates_mail")
        .update({
          objet: t.objet,
          contenu: t.contenu,
          categorie: t.categorie,
          est_defaut: true,
        })
        .eq("id", ex.id);
    }
  } else {
    // Base pré-004 : au moins backfiller la catégorie manquante (legacy).
    for (const t of DEFAULT_TEMPLATES) {
      const ex = parNom.get(t.nom);
      if (ex && !ex.categorie) {
        await supabase
          .from("templates_mail")
          .update({ categorie: t.categorie })
          .eq("id", ex.id)
          .then(undefined, () => {});
      }
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
