import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET — historique des remboursements d'un dossier (pour la fiche).
export async function GET(request: Request, { params }: Ctx) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const { id } = await params;
  if (!isSupabaseConfigured()) return NextResponse.json({ remboursements: [] });

  const supabase = getSupabaseAdmin();
  const data = exigerData(
    await supabase
      .from("remboursements")
      .select("id, montant_effectif, canal, ferme_inscription, statut, created_at, finished_at")
      .eq("adherent_id", id)
      .eq("statut", "fait")
      .order("created_at", { ascending: false }),
    "fiche: historique remboursements",
  );

  return NextResponse.json({ remboursements: data ?? [] });
}
