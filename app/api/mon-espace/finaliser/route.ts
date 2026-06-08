import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import { nbEcheances, TARIFS, type ModePaiement } from "@/lib/pricing";
import { planEcheances, echeancesAutorisees } from "@/lib/tarifs";
import { estEngage } from "@/lib/engagement";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

const MODES: ModePaiement[] = [
  "stripe_1x",
  "stripe_2x",
  "stripe_3x",
  "stripe_4x",
  "especes",
];

// POST — finaliser le paiement d'un dossier EXISTANT (non payé), sans créer de
// doublon. L'adhérent peut re-choisir librement son mode. Échéancier calculé à
// partir d'aujourd'hui ; total figé conservé.
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: { adherentId?: string; mode_paiement?: ModePaiement };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const adherentId = String(body.adherentId || "").trim();
  const mode = body.mode_paiement as ModePaiement;
  if (!adherentId) {
    return NextResponse.json({ error: "Dossier non précisé." }, { status: 400 });
  }
  if (!mode || !MODES.includes(mode)) {
    return NextResponse.json({ error: "Mode de paiement invalide." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", adherentId)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }
  const adherent = data as Adherent;

  // Sécurité : appartenance au compte connecté.
  if (adherent.titulaire_id !== user.id) {
    return NextResponse.json(
      { error: "Ce dossier n'appartient pas à votre compte." },
      { status: 403 },
    );
  }
  // Sécurité : on ne finalise QUE des dossiers non encore engagés.
  if (estEngage(adherent)) {
    return NextResponse.json(
      { error: "Ce dossier a déjà un paiement validé." },
      { status: 409 },
    );
  }

  // On repart d'une ardoise propre : suppression des anciennes tentatives
  // (aucune n'est payée puisque le dossier n'est pas engagé).
  await supabase.from("paiements").delete().eq("adherent_id", adherentId);

  // ---------- Espèces : pas de Stripe ----------
  if (mode === "especes") {
    await supabase
      .from("adherents")
      .update({
        mode_paiement: "especes",
        statut_paiement: "en_attente",
        nb_echeances: 1,
        prochaine_echeance: null,
        stripe_payment_intent_id: null,
        stripe_setup_intent_id: null,
        derniere_erreur_stripe: null,
      })
      .eq("id", adherentId);
    return NextResponse.json({ intentType: "especes", adherentId });
  }

  // ---------- Carte / fractionné ----------
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Paiement en ligne non configuré." }, { status: 503 });
  }
  const n = nbEcheances(mode);
  const now = new Date();
  if (!echeancesAutorisees(now).includes(n)) {
    return NextResponse.json(
      { error: "Échéancier non disponible à cette période de la saison." },
      { status: 400 },
    );
  }

  // Montant FIGÉ : on réutilise le total déjà stocké (adhésion non fractionnée).
  const total = Number(adherent.montant_total);
  const adhesion = adherent.nouveau_membre ? TARIFS.adhesion : 0;
  const fractionnable = Math.round((total - adhesion) * 100) / 100;
  const plan = planEcheances(fractionnable, adhesion, now, n);

  const stripe = getStripe();
  try {
    const customerId =
      adherent.stripe_customer_id ||
      (
        await stripe.customers.create({
          email: adherent.email,
          name: `${adherent.prenom} ${adherent.nom}`,
          metadata: { adherentId: adherent.id, saison: adherent.saison ?? "" },
        })
      ).id;

    // -------- Comptant (1x) --------
    if (n === 1) {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(total * 100),
        currency: "eur",
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        description: `Inscription ${adherent.saison} — ${adherent.prenom} ${adherent.nom}`,
        metadata: { adherentId: adherent.id, numero: "1", type: "comptant" },
      });
      await supabase
        .from("adherents")
        .update({
          mode_paiement: mode,
          nb_echeances: 1,
          prochaine_echeance: null,
          statut_paiement: "en_attente",
          stripe_customer_id: customerId,
          stripe_payment_intent_id: intent.id,
          stripe_setup_intent_id: null,
          derniere_erreur_stripe: null,
        })
        .eq("id", adherentId);
      await supabase.from("paiements").insert({
        adherent_id: adherentId,
        stripe_payment_intent_id: intent.id,
        montant: total,
        statut: "en_attente",
        numero_echeance: 1,
        date_prevue: plan.dates[0],
      });
      return NextResponse.json({
        intentType: "payment",
        clientSecret: intent.client_secret,
        adherentId,
        nbEcheances: 1,
        total,
        adhesion,
        premierPrelevement: total,
        dates: plan.dates,
        montants: plan.montants,
      });
    }

    // -------- Fractionné (2x/3x/4x) : enregistrement de la carte --------
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      automatic_payment_methods: { enabled: true },
      metadata: { adherentId: adherent.id, echeances: String(n) },
    });
    await supabase
      .from("adherents")
      .update({
        mode_paiement: mode,
        nb_echeances: n,
        prochaine_echeance: plan.dates[1],
        statut_paiement: "en_attente",
        stripe_customer_id: customerId,
        stripe_setup_intent_id: setupIntent.id,
        stripe_payment_intent_id: null,
        derniere_erreur_stripe: null,
      })
      .eq("id", adherentId);
    return NextResponse.json({
      intentType: "setup",
      clientSecret: setupIntent.client_secret,
      adherentId,
      nbEcheances: n,
      total,
      adhesion,
      premierPrelevement: plan.premierPrelevement,
      dates: plan.dates,
      montants: plan.montants,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Stripe.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
