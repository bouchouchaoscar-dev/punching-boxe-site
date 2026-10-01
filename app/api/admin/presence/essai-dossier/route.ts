import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { presenceActif } from "@/lib/presence";
import { matchKey } from "@/lib/anciennete";

export const runtime = "nodejs";

// GET /api/admin/presence/essai-dossier?id=<dossierId> — séance d'essai liée à un
// dossier (converti_dossier_id, sinon email, sinon triplet). Pour la fiche adhérent.
export async function GET(request: Request) {
  if (!presenceActif()) return NextResponse.json({ essai: null });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ essai: null });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ essai: null });

  const supabase = getSupabaseAdmin();
  const adh = exigerData(
    await supabase
      .from("adherents")
      .select("id, email, nom, prenom, date_naissance")
      .eq("id", id)
      .maybeSingle(),
    "essai-dossier: adhérent",
  );
  if (!adh) return NextResponse.json({ essai: null });

  const essais = exigerData(
    await supabase
      .from("essais")
      .select("id, date_seance, cours_id, nom, prenom, date_naissance, converti_dossier_id")
      .order("date_seance", { ascending: true }),
    "essai-dossier: essais",
  );

  // Rattachement essai → fiche : lien explicite (converti_dossier_id) OU triplet
  // d'identité (matchKey). JAMAIS l'email (un email = souvent une famille).
  const cleAdh = matchKey(adh.nom ?? "", adh.prenom ?? "", adh.date_naissance);
  const match = (essais ?? []).find(
    (e) =>
      e.converti_dossier_id === id ||
      (cleAdh !== null &&
        matchKey(e.nom as string, e.prenom as string, e.date_naissance as string | null) === cleAdh),
  );
  if (!match) return NextResponse.json({ essai: null });

  let coursLabel: string | null = null;
  if (match.cours_id) {
    const c = exigerData(
      await supabase.from("cours").select("libelle").eq("id", match.cours_id).maybeSingle(),
      "essai-dossier: libellé cours",
    );
    coursLabel = (c?.libelle as string) ?? null;
  }
  return NextResponse.json({ essai: { date_seance: match.date_seance, coursLabel } });
}
