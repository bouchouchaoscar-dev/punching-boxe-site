import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/adherents/[id]/changements-formule — historique des changements
// de formule d'un dossier (section « Changements de formule » de la fiche admin).
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ changements: [] });

  const supabase = getSupabaseAdmin();
  let changements: unknown[] = [];
  try {
    const data = exigerData(
      await supabase
        .from("changements_formule")
        .select("id, ancienne_formule, nouvelle_formule, source, montant_cents, mode_reglement, statut, signe_at, signature_requise, created_by, motif, created_at, paiement_id")
        .eq("dossier_id", id)
        .order("created_at", { ascending: false }),
      "historique changements formule",
    );
    changements = data ?? [];
  } catch {
    // Table 018 non migrée → historique vide (rien ne casse).
    changements = [];
  }
  return NextResponse.json({ changements }, { headers: { "Cache-Control": "no-store" } });
}
