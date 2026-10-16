import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { recalculerSupplement } from "@/lib/payments";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/adherents/[id]/confirmer-supplement-especes — l'admin confirme
// l'encaissement ESPÈCES d'un supplément de changement de formule (cas b). Marque
// la ligne paiements du supplément « paye » → recalculerSupplement efface le cache
// supplement_statut. Idempotent. Fail-closed admin.
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  const supabase = getSupabaseAdmin();
  // Supplément espèces en attente (changement actif, mode espèces, paiement non payé).
  const changements = exigerData(
    await supabase
      .from("changements_formule")
      .select("id, paiement_id, mode_reglement, statut, montant_cents")
      .eq("dossier_id", id)
      .eq("statut", "actif")
      .eq("mode_reglement", "especes"),
    "confirmer supplément: changements",
  );
  const avecPaie = (changements ?? []).filter((c) => c.paiement_id);
  if (avecPaie.length === 0) {
    return NextResponse.json({ error: "Aucun supplément espèces à confirmer." }, { status: 404 });
  }
  const paieIds = avecPaie.map((c) => c.paiement_id as string);
  // Marque payé uniquement ceux encore en attente (idempotent).
  await supabase
    .from("paiements")
    .update({ statut: "paye", date_paiement: new Date().toISOString() })
    .in("id", paieIds)
    .neq("statut", "paye");
  // Recalcul → efface supplement_statut (seul écrivain).
  await recalculerSupplement(supabase, id);
  const montant = avecPaie.reduce((s, c) => s + Number(c.montant_cents || 0), 0) / 100;
  return NextResponse.json({ ok: true, montant });
}
