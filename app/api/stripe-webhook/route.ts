import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  marquerEcheancePayee,
  marquerEcheanceEchec,
  markAdherentPaid,
  appliquerRegularisation,
  appliquerRemboursement,
  appliquerLitige,
} from "@/lib/payments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe non configuré." }, { status: 503 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers.get("stripe-signature");
  if (!secret || !sig) {
    return NextResponse.json({ error: "Signature manquante." }, { status: 400 });
  }

  const stripe = getStripe();
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Signature invalide.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      // Régularisation self-service : remplace la carte + marque payé + nettoie.
      if (intent.metadata?.type === "regularisation") {
        await appliquerRegularisation(intent);
        break;
      }
      const found = await marquerEcheancePayee(intent.id);
      // Filet : ancien flux sans table paiements.
      if (!found && intent.metadata?.adherentId) {
        await markAdherentPaid(intent.metadata.adherentId, intent.id);
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const message =
        intent.last_payment_error?.message || "Le paiement a échoué.";
      const code =
        intent.last_payment_error?.decline_code ||
        intent.last_payment_error?.code ||
        null;
      await marquerEcheanceEchec(intent.id, message, code);
      break;
    }
    case "setup_intent.succeeded": {
      // Carte enregistrée : rien à faire ici, la confirmation déclenche
      // les prélèvements (cf. /api/confirm-payment).
      break;
    }
    case "charge.refunded": {
      // Remboursement (total ou partiel) fait dans Stripe → reflet dans l'app.
      await appliquerRemboursement(event.data.object as Stripe.Charge);
      break;
    }
    case "charge.dispute.created": {
      // Litige / chargeback ouvert → flag + arrêt des échéances futures.
      await appliquerLitige(event.data.object as Stripe.Dispute, "ouvert");
      break;
    }
    case "charge.dispute.closed": {
      // Litige tranché → on enregistre l'issue (won/lost).
      const dispute = event.data.object as Stripe.Dispute;
      const issue = dispute.status === "won" ? "gagne" : "perdu";
      await appliquerLitige(dispute, issue);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
