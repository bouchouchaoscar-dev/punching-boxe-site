import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  buildAdherentInsert,
  validatePayload,
  type InscriptionPayload,
} from "@/lib/inscription";
import { nbEcheances, montantParEcheance } from "@/lib/pricing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Paiement en ligne non configuré (Stripe / Supabase)." },
      { status: 503 },
    );
  }

  let payload: InscriptionPayload;
  try {
    payload = (await request.json()) as InscriptionPayload;
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const err = validatePayload(payload);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  if (!payload.mode_paiement.startsWith("stripe")) {
    return NextResponse.json({ error: "Mode de paiement non Stripe." }, { status: 400 });
  }

  const record = buildAdherentInsert(payload, "en_attente");
  const n = nbEcheances(payload.mode_paiement);
  const premiereEcheance = montantParEcheance(record.montant_total, n);
  const amountCents = Math.round(premiereEcheance * 100);

  const supabase = getSupabaseAdmin();
  const { data: adherent, error: insErr } = await supabase
    .from("adherents")
    .insert(record)
    .select()
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const stripe = getStripe();
  try {
    const customer = await stripe.customers.create({
      email: record.email,
      name: `${record.prenom} ${record.nom}`,
      metadata: { adherentId: adherent.id, saison: record.saison },
    });

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "eur",
      customer: customer.id,
      // Pour 2x/3x/4x : on enregistre la carte afin de prélever les
      // échéances suivantes (planification documentée côté admin).
      setup_future_usage: n > 1 ? "off_session" : undefined,
      automatic_payment_methods: { enabled: true },
      description: `Inscription ${record.saison} — ${record.prenom} ${record.nom}`,
      metadata: {
        adherentId: adherent.id,
        plan: payload.mode_paiement,
        echeances: String(n),
        total: String(record.montant_total),
      },
    });

    await supabase
      .from("adherents")
      .update({ stripe_payment_intent_id: intent.id })
      .eq("id", adherent.id);

    return NextResponse.json({
      clientSecret: intent.client_secret,
      adherentId: adherent.id,
      nbEcheances: n,
      montantEcheance: premiereEcheance,
      total: record.montant_total,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Stripe.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
