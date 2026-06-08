import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import { estEngage } from "@/lib/engagement";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

// POST — régularise la PLUS ANCIENNE échéance en échec d'un dossier engagé.
// Crée un PaymentIntent (montant exact de l'échéance) avec setup_future_usage :
// l'adhérent saisit une carte qui encaisse l'échéance ET devient la carte par
// défaut (échéances futures). Pas de doublon, pas de regroupement.
export async function POST(request: Request) {
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Paiement non configuré." }, { status: 503 });
  }
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: { adherentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const adherentId = String(body.adherentId || "").trim();
  if (!adherentId) {
    return NextResponse.json({ error: "Dossier non précisé." }, { status: 400 });
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

  if (adherent.titulaire_id !== user.id) {
    return NextResponse.json(
      { error: "Ce dossier n'appartient pas à votre compte." },
      { status: 403 },
    );
  }
  // La régularisation ne concerne que les dossiers ENGAGÉS (1er paiement passé).
  if (!estEngage(adherent)) {
    return NextResponse.json(
      { error: "Ce dossier n'est pas encore engagé." },
      { status: 409 },
    );
  }

  // Plus ancienne échéance en échec.
  const { data: echec } = await supabase
    .from("paiements")
    .select("id, montant, numero_echeance")
    .eq("adherent_id", adherentId)
    .eq("statut", "echec")
    .not("numero_echeance", "is", null)
    .order("numero_echeance", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!echec) {
    return NextResponse.json(
      { error: "Aucune échéance en échec à régulariser." },
      { status: 404 },
    );
  }

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

    const montant = Number(echec.montant || 0);
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(montant * 100),
      currency: "eur",
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      // La carte saisie encaisse CETTE échéance ET reste réutilisable off-session.
      setup_future_usage: "off_session",
      description: `Régularisation échéance ${echec.numero_echeance} — ${adherent.prenom} ${adherent.nom}`,
      metadata: {
        adherentId: adherent.id,
        paiementId: echec.id,
        numero: String(echec.numero_echeance ?? ""),
        type: "regularisation",
      },
    });

    // Lien PI ↔ ligne d'échéance (statut reste 'echec' jusqu'au succès).
    await supabase
      .from("paiements")
      .update({ stripe_payment_intent_id: intent.id })
      .eq("id", echec.id);
    if (!adherent.stripe_customer_id) {
      await supabase
        .from("adherents")
        .update({ stripe_customer_id: customerId })
        .eq("id", adherentId);
    }

    return NextResponse.json({
      intentType: "payment",
      clientSecret: intent.client_secret,
      adherentId,
      paiementId: echec.id,
      numero: echec.numero_echeance,
      montant,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Stripe.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
