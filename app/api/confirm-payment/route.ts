import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { markAdherentPaid } from "@/lib/payments";

export const runtime = "nodejs";

/**
 * Confirmation côté client après succès de Stripe Elements.
 * Filet de sécurité si le webhook n'est pas (encore) configuré.
 * Idempotent : ne marque payé que si Stripe confirme « succeeded ».
 */
export async function POST(request: Request) {
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Non configuré." }, { status: 503 });
  }

  let body: { adherentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (!body.adherentId) {
    return NextResponse.json({ error: "adherentId requis." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: adherent } = await supabase
    .from("adherents")
    .select("id, stripe_payment_intent_id, statut_paiement")
    .eq("id", body.adherentId)
    .single();

  if (!adherent?.stripe_payment_intent_id) {
    return NextResponse.json({ error: "Aucun paiement associé." }, { status: 404 });
  }

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(
    adherent.stripe_payment_intent_id,
  );

  if (intent.status !== "succeeded") {
    return NextResponse.json(
      { paid: false, status: intent.status },
      { status: 200 },
    );
  }

  const res = await markAdherentPaid(body.adherentId, intent.id);
  return NextResponse.json({ paid: true, updated: res.updated });
}
