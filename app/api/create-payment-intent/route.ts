import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  buildAdherentInsert,
  validatePayload,
  OPTIONAL_DOC_COLUMNS,
  type InscriptionPayload,
} from "@/lib/inscription";
import { nbEcheances } from "@/lib/pricing";
import { devisPourAdherent, planEcheances } from "@/lib/tarifs";

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

  const now = new Date();
  const devis = devisPourAdherent(payload, now);
  const n = nbEcheances(payload.mode_paiement);

  // Sécurité : l'échéancier demandé doit être autorisé pour cette date.
  if (!devis.echeancesAutorisees.includes(n)) {
    return NextResponse.json(
      { error: "Échéancier non disponible à cette période de la saison." },
      { status: 400 },
    );
  }

  const plan = planEcheances(devis.fractionnable, devis.adhesion, now, n);

  // Adhérent (montant proratisé recalculé côté serveur).
  const record = {
    ...buildAdherentInsert(payload, "en_attente"),
    montant_total: devis.total,
    nb_echeances: n,
    prochaine_echeance: n > 1 ? plan.dates[1] : null,
  };

  const supabase = getSupabaseAdmin();
  let { data: adherent, error: insErr } = await supabase
    .from("adherents")
    .insert(record)
    .select()
    .single();
  if (insErr && OPTIONAL_DOC_COLUMNS.some((c) => insErr!.message.includes(c))) {
    const rest = { ...record } as Record<string, unknown>;
    for (const c of OPTIONAL_DOC_COLUMNS) delete rest[c];
    ({ data: adherent, error: insErr } = await supabase
      .from("adherents")
      .insert(rest)
      .select()
      .single());
  }
  if (insErr || !adherent) {
    return NextResponse.json(
      { error: insErr?.message || "Insertion impossible." },
      { status: 500 },
    );
  }

  const stripe = getStripe();
  try {
    const customer = await stripe.customers.create({
      email: record.email,
      name: `${record.prenom} ${record.nom}`,
      metadata: { adherentId: adherent.id, saison: record.saison },
    });

    // -------- Paiement comptant (1x) --------
    if (n === 1) {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(devis.total * 100),
        currency: "eur",
        customer: customer.id,
        automatic_payment_methods: { enabled: true },
        description: `Inscription ${record.saison} — ${record.prenom} ${record.nom}`,
        metadata: { adherentId: adherent.id, numero: "1", type: "comptant" },
      });

      await supabase
        .from("adherents")
        .update({
          stripe_customer_id: customer.id,
          stripe_payment_intent_id: intent.id,
        })
        .eq("id", adherent.id);

      // Échéance unique en attente (sera marquée payée au succès).
      await supabase.from("paiements").insert({
        adherent_id: adherent.id,
        stripe_payment_intent_id: intent.id,
        montant: devis.total,
        statut: "en_attente",
        numero_echeance: 1,
        date_prevue: plan.dates[0],
      });

      return NextResponse.json({
        intentType: "payment",
        clientSecret: intent.client_secret,
        adherentId: adherent.id,
        nbEcheances: 1,
        total: devis.total,
        adhesion: devis.adhesion,
        proratise: devis.proratise,
        premierPrelevement: devis.total,
        dates: plan.dates,
        montants: plan.montants,
      });
    }

    // -------- Paiement fractionné (2x/3x/4x) : enregistrement de la carte --------
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      usage: "off_session",
      automatic_payment_methods: { enabled: true },
      metadata: { adherentId: adherent.id, echeances: String(n) },
    });

    await supabase
      .from("adherents")
      .update({
        stripe_customer_id: customer.id,
        stripe_setup_intent_id: setupIntent.id,
      })
      .eq("id", adherent.id);

    return NextResponse.json({
      intentType: "setup",
      clientSecret: setupIntent.client_secret,
      adherentId: adherent.id,
      nbEcheances: n,
      total: devis.total,
      adhesion: devis.adhesion,
      proratise: devis.proratise,
      premierPrelevement: plan.premierPrelevement,
      dates: plan.dates,
      montants: plan.montants,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Stripe.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
