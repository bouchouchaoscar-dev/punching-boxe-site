import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendAdminAlertePaiement } from "@/lib/email";
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
      // Filet : ancien flux sans table paiements. On ne sollicite markAdherentPaid
      // (comptant) QUE si ce PI est bien le PI COURANT du dossier — un PI orphelin
      // / obsolète / parallèle ne doit jamais marquer payé. markAdherentPaid
      // re-vérifie l'encaissement réel côté Stripe (montant + status) ; ici on
      // court-circuite l'orphelin en amont (évite un retrieve inutile) en le
      // traçant + alerte admin. Les deux chemins sont exclusifs → une seule alerte.
      if (!found && intent.metadata?.adherentId) {
        const adherentId = intent.metadata.adherentId;
        const supabase = getSupabaseAdmin();
        const { data: adh } = await supabase
          .from("adherents")
          .select("prenom, nom, montant_total, stripe_payment_intent_id")
          .eq("id", adherentId)
          .maybeSingle();
        if (adh && intent.id === adh.stripe_payment_intent_id) {
          await markAdherentPaid(adherentId, intent.id);
        } else {
          console.error(
            `[ALERTE PAIEMENT 1x] REJET filet webhook — adherent=${adherentId} pi=${intent.id} : PaymentIntent ${adh ? "orphelin (≠ PI courant)" : "sans dossier"}`,
          );
          try {
            await sendAdminAlertePaiement({
              prenom: adh?.prenom ?? "",
              nom: adh?.nom ?? "",
              adherentId,
              montant: Number(adh?.montant_total || 0),
              paymentIntentId: intent.id,
              issue: adh
                ? "Rejeté — PaymentIntent orphelin (≠ PI courant du dossier)"
                : "Rejeté — PaymentIntent sans dossier correspondant",
            });
          } catch (e) {
            console.error("[ALERTE PAIEMENT 1x] envoi mail admin échoué:", e);
          }
        }
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
