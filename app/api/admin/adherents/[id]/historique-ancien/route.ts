import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { statutAge } from "@/lib/anciennete";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET — historique des saisons de l'ANCIEN lié à un dossier natif (ancien_id).
// Renvoie le même format que l'onglet Anciens. Vide si pas de lien.
export async function GET(request: Request, { params }: Ctx) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const { id } = await params;
  if (!isSupabaseConfigured()) return NextResponse.json({ historique: [] });

  const supabase = getSupabaseAdmin();
  const { data: adh } = await supabase
    .from("adherents")
    .select("ancien_id")
    .eq("id", id)
    .maybeSingle();
  const ancienId = adh?.ancien_id as string | null | undefined;
  if (!ancienId) return NextResponse.json({ historique: [] });

  const { data: ancien } = await supabase
    .from("anciens_adherents")
    .select("date_naissance")
    .eq("id", ancienId)
    .maybeSingle();
  const naissance = (ancien?.date_naissance as string | null) ?? null;

  const { data: hist } = await supabase
    .from("historique_saisons")
    .select("saison, disciplines, montant")
    .eq("ancien_id", ancienId);

  const historique = (hist ?? [])
    .map((h) => ({
      saison: h.saison as string,
      disciplines: (h.disciplines as string[]) ?? [],
      montant: h.montant == null ? null : Number(h.montant),
      statut: statutAge(naissance, h.saison as string),
    }))
    .sort((a, b) => b.saison.localeCompare(a.saison));

  return NextResponse.json({ ancienId, historique });
}
