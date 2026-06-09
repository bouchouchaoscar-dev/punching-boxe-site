import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST — annule une inscription : STOPPE les prélèvements à venir (échéances non
// payées → 'annule'), pose annule_at, vide la prochaine échéance. N'initie AUCUN
// mouvement d'argent (le remboursement éventuel se fait dans Stripe et est
// reflété par le webhook). Réservé à l'admin.
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const { data: adherent, error } = await supabase
    .from("adherents")
    .select("id, annule_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !adherent) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }

  // Stoppe toutes les échéances non encore réglées (à venir, dues, en cours ou
  // en échec) → 'annule'. Les échéances 'paye' ne sont jamais touchées.
  const { data: annulees } = await supabase
    .from("paiements")
    .update({ statut: "annule" })
    .eq("adherent_id", id)
    .in("statut", ["en_attente", "en_cours", "echec"])
    .not("numero_echeance", "is", null)
    .select("id");

  const { data: updated, error: updErr } = await supabase
    .from("adherents")
    .update({
      annule_at: adherent.annule_at ?? new Date().toISOString(),
      prochaine_echeance: null,
    })
    .eq("id", id)
    .select()
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    echeancesAnnulees: annulees?.length ?? 0,
    adherent: updated,
  });
}
