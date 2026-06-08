import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import { appliquerRegularisation } from "@/lib/payments";

export const runtime = "nodejs";

// POST — après saisie de carte côté client : vérifie le PaymentIntent de la
// régularisation, et si payé applique la régularisation (carte par défaut +
// échéance payée + nettoyage du statut). Idempotent (le webhook fait de même).
export async function POST(request: Request) {
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Non configuré." }, { status: 503 });
  }
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: { adherentId?: string; paiementId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const adherentId = String(body.adherentId || "").trim();
  const paiementId = String(body.paiementId || "").trim();
  if (!adherentId || !paiementId) {
    return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Appartenance du dossier.
  const { data: adherent } = await supabase
    .from("adherents")
    .select("id, titulaire_id")
    .eq("id", adherentId)
    .maybeSingle();
  if (!adherent) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }
  if (adherent.titulaire_id !== user.id) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  // Ligne d'échéance ciblée (du même dossier).
  const { data: row } = await supabase
    .from("paiements")
    .select("id, adherent_id, stripe_payment_intent_id")
    .eq("id", paiementId)
    .maybeSingle();
  if (!row || row.adherent_id !== adherentId || !row.stripe_payment_intent_id) {
    return NextResponse.json({ error: "Échéance introuvable." }, { status: 404 });
  }

  const pi = await getStripe().paymentIntents.retrieve(
    row.stripe_payment_intent_id,
  );
  if (pi.status !== "succeeded") {
    return NextResponse.json({ paid: false, status: pi.status });
  }

  await appliquerRegularisation(pi);
  return NextResponse.json({ paid: true });
}
