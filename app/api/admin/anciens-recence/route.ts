import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

// GET — récence des anciens pour le constructeur de campagne (comptes des
// segments côté UI). Champs minimaux (pas nom/email en clair) : seulement de
// quoi classer et compter. L'envoi réel relit la vue côté serveur.
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ anciens: [] });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("anciens_recence")
    .select("id, email, derniere_saison, disciplines");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Anciens déjà réinscrits (représentés par leur dossier natif) → exclus des comptes.
  const { data: migr } = await supabase
    .from("adherents")
    .select("ancien_id")
    .not("ancien_id", "is", null);
  const migres = new Set((migr ?? []).map((m) => m.ancien_id as string));

  const anciens = (data ?? [])
    .filter((a) => !migres.has(a.id as string))
    .map((a) => ({
      id: a.id,
      derniere_saison: a.derniere_saison,
      disciplines: a.disciplines ?? [],
      has_email: !!(a.email && String(a.email).trim()),
    }));

  return NextResponse.json({ anciens });
}
