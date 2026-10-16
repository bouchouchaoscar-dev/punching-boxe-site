import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { encaisserEspeces } from "@/lib/payments";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/adherents/[id]/confirmer-supplement-especes — l'admin confirme
// l'encaissement ESPÈCES d'un supplément de changement de formule (cas b). [020]
// Délègue au moteur d'encaissement (versement = ligne paiements, total calculé) :
// « tout encaisser » le reste dû de chaque supplément espèces actif. Idempotent.
// Fail-closed admin. (L'encaissement PARTIEL passe par /encaisser-especes avec changementId.)
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  const supabase = getSupabaseAdmin();
  const changements = exigerData(
    await supabase
      .from("changements_formule")
      .select("id, mode_reglement, statut, montant_cents")
      .eq("dossier_id", id)
      .eq("statut", "actif")
      .eq("mode_reglement", "especes"),
    "confirmer supplément: changements",
  );
  const actifs = (changements ?? []).filter((c) => Number(c.montant_cents || 0) > 0);
  if (actifs.length === 0) {
    return NextResponse.json({ error: "Aucun supplément espèces à confirmer." }, { status: 404 });
  }
  let montant = 0;
  for (const c of actifs) {
    const r = await encaisserEspeces(supabase, { adherentId: id, versementId: randomUUID(), tout: true, changementId: c.id as string });
    if (r.ok) montant += r.cible.encaisse; // encaissé après coup
  }
  return NextResponse.json({ ok: true, montant });
}
