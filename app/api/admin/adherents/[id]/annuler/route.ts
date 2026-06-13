import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { annulerEcheances } from "@/lib/payments";
import { sendFinInscription } from "@/lib/email";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST — annule une inscription : STOPPE les prélèvements à venir (échéances non
// payées → 'annule'), pose annule_at, vide la prochaine échéance. N'initie AUCUN
// mouvement d'argent (le remboursement éventuel se fait dans Stripe et est
// reflété par le webhook). Réservé à l'admin. (Le panneau « Gérer le paiement »
// passe par /gerer-paiement ; cet endpoint reste pour usage interne/compat.)
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const { data: adherent } = await supabase
    .from("adherents")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!adherent) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }

  const { annulees } = await annulerEcheances(supabase, id);
  const { data: updated } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", id)
    .single();

  // Email de clôture (best-effort) : fin d'inscription sans remboursement.
  if (updated?.email) {
    try {
      await sendFinInscription({
        prenom: updated.prenom ?? "",
        email: updated.email,
        date: updated.annule_at ?? new Date().toISOString(),
      });
    } catch (e) {
      console.error("Email clôture:", e);
    }
  }

  return NextResponse.json({
    success: true,
    echeancesAnnulees: annulees,
    adherent: updated,
  });
}
