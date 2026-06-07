import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { marquerEcheancePayee, recalculerEtatPaiement } from "@/lib/payments";
import { devisPourAdherent, planEcheances } from "@/lib/tarifs";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Appelée après confirmation côté client :
 * - flux 1x : vérifie le PaymentIntent et marque payé ;
 * - flux 2x/3x/4x : enregistre la carte (SetupIntent), prélève immédiatement
 *   la 1ère échéance + les suppléments, et planifie les échéances suivantes.
 * Idempotent.
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
  const { data, error } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", body.adherentId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Adhérent introuvable." }, { status: 404 });
  }
  const adherent = data as Adherent;
  const stripe = getStripe();

  // ---------- Flux comptant (1x) ----------
  if ((adherent.nb_echeances || 1) <= 1) {
    if (!adherent.stripe_payment_intent_id) {
      return NextResponse.json({ error: "Aucun paiement associé." }, { status: 404 });
    }
    const intent = await stripe.paymentIntents.retrieve(
      adherent.stripe_payment_intent_id,
    );
    if (intent.status !== "succeeded") {
      return NextResponse.json({ paid: false, status: intent.status });
    }
    await marquerEcheancePayee(intent.id);
    return NextResponse.json({ paid: true });
  }

  // ---------- Flux fractionné (2x/3x/4x) ----------
  if (!adherent.stripe_setup_intent_id || !adherent.stripe_customer_id) {
    return NextResponse.json({ error: "Configuration de carte manquante." }, { status: 400 });
  }

  // Idempotence : si des échéances existent déjà, ne pas re-traiter.
  const { count } = await supabase
    .from("paiements")
    .select("id", { count: "exact", head: true })
    .eq("adherent_id", adherent.id);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ paid: true, alreadyProcessed: true });
  }

  const setupIntent = await stripe.setupIntents.retrieve(
    adherent.stripe_setup_intent_id,
  );
  const pm = setupIntent.payment_method as string | null;
  if (setupIntent.status !== "succeeded" || !pm) {
    return NextResponse.json(
      { paid: false, status: setupIntent.status },
      { status: 200 },
    );
  }

  // Carte par défaut du client (pour les prélèvements off_session futurs).
  await stripe.customers.update(adherent.stripe_customer_id, {
    invoice_settings: { default_payment_method: pm },
  });

  const date = new Date(adherent.created_at);
  const n = adherent.nb_echeances;
  const devis = devisPourAdherent(adherent, date);
  const plan = planEcheances(devis.fractionnable, devis.adhesion, date, n);
  const today = plan.dates[0];

  const chargerImmediat = async (
    amount: number,
    meta: Record<string, string>,
    numero: number | null,
  ) => {
    try {
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "eur",
        customer: adherent.stripe_customer_id!,
        payment_method: pm,
        off_session: true,
        confirm: true,
        description: `Inscription ${adherent.saison} — ${adherent.prenom} ${adherent.nom}`,
        metadata: { adherentId: adherent.id, ...meta },
      });
      await supabase.from("paiements").insert({
        adherent_id: adherent.id,
        stripe_payment_intent_id: pi.id,
        montant: amount,
        statut: pi.status === "succeeded" ? "paye" : "en_attente",
        numero_echeance: numero,
        date_prevue: today,
        date_paiement: pi.status === "succeeded" ? new Date().toISOString() : null,
      });
      if (pi.status === "succeeded") await marquerEcheancePayee(pi.id);
      return pi.status === "succeeded";
    } catch (e) {
      const err = e as { message?: string; raw?: { payment_intent?: { id?: string } } };
      await supabase.from("paiements").insert({
        adherent_id: adherent.id,
        stripe_payment_intent_id: err?.raw?.payment_intent?.id ?? null,
        montant: amount,
        statut: "echec",
        numero_echeance: numero,
        date_prevue: today,
      });
      await supabase
        .from("adherents")
        .update({
          derniere_erreur_stripe: err?.message ?? "Échec du prélèvement.",
          statut_paiement: "echec_paiement",
        })
        .eq("id", adherent.id);
      return false;
    }
  };

  // 1) Adhésion (30€) — immédiat, 1x séparé, NON fractionnée.
  if (devis.adhesion > 0) {
    await chargerImmediat(devis.adhesion, { type: "adhesion" }, null);
  }

  // 2) 1ère échéance (cotisation proratisée + prépa, répartie) — immédiat.
  await chargerImmediat(plan.montants[0], { numero: "1" }, 1);

  // 3) Échéances suivantes — planifiées (prélevées par le cron à échéance).
  for (let i = 1; i < n; i++) {
    await supabase.from("paiements").insert({
      adherent_id: adherent.id,
      montant: plan.montants[i],
      statut: "en_attente",
      numero_echeance: i + 1,
      date_prevue: plan.dates[i],
    });
  }

  // Recalcule l'état (echeances_payees / prochaine_echeance) après planification.
  await recalculerEtatPaiement(adherent.id);

  return NextResponse.json({ paid: true, nbEcheances: n });
}
