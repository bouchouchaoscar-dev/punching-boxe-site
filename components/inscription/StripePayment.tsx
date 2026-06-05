"use client";

import { useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { ButtonAction } from "@/components/ui/Button";
import { euro } from "@/lib/pricing";
import { formatDateFr } from "@/lib/tarifs";

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!pk) return null;
  if (!stripePromise) stripePromise = loadStripe(pk);
  return stripePromise;
}

export type StripePlan = {
  intentType: "payment" | "setup";
  clientSecret: string;
  adherentId: string;
  nbEcheances: number;
  total: number;
  supplements: number;
  premierPrelevement: number;
  dates: string[];
  montants: number[];
};

export function StripePayment({
  plan,
  onSuccess,
}: {
  plan: StripePlan;
  onSuccess: () => void;
}) {
  const promise = getStripePromise();
  if (!promise) {
    return (
      <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
        Clé Stripe publique manquante (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).
      </p>
    );
  }

  return (
    <Elements
      stripe={promise}
      options={{
        clientSecret: plan.clientSecret,
        appearance: {
          theme: "flat",
          variables: {
            colorPrimary: "#FF6B00",
            colorBackground: "#ffffff",
            colorDanger: "#dc2626",
            borderRadius: "12px",
            fontFamily: "Manrope, system-ui, sans-serif",
          },
        },
      }}
    >
      <PaymentInner plan={plan} onSuccess={onSuccess} />
    </Elements>
  );
}

function PaymentInner({
  plan,
  onSuccess,
}: {
  plan: StripePlan;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fractionne = plan.nbEcheances > 1;

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError("");

    const result =
      plan.intentType === "setup"
        ? await stripe.confirmSetup({ elements, redirect: "if_required" })
        : await stripe.confirmPayment({ elements, redirect: "if_required" });

    if (result.error) {
      setError(result.error.message || "Le paiement a échoué.");
      setLoading(false);
      return;
    }

    // Côté serveur : prélève la 1ère échéance + suppléments et planifie le reste
    // (ou marque payé pour le comptant). Le webhook fait foi au final.
    try {
      await fetch("/api/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adherentId: plan.adherentId }),
      });
    } catch {
      /* le webhook prendra le relais */
    }
    onSuccess();
  }

  return (
    <form onSubmit={pay} className="space-y-5">
      {fractionne && (
        <div className="rounded-xl border border-orange/20 bg-orange-50 p-4 text-sm text-ink">
          <p className="font-bold">
            Paiement en {plan.nbEcheances} fois — échéancier
          </p>
          <ul className="mt-2 space-y-1">
            {plan.dates.map((d, i) => (
              <li key={d} className="flex justify-between gap-3">
                <span>
                  {i === 0
                    ? "1er prélèvement : aujourd'hui"
                    : `${i + 1}ᵉ prélèvement : ${formatDateFr(d)}`}
                </span>
                <span className="font-semibold">{euro(plan.montants[i])}</span>
              </li>
            ))}
          </ul>
          {plan.supplements > 0 && (
            <p className="mt-2 border-t border-orange/20 pt-2 text-xs text-smoke">
              Les suppléments ({euro(plan.supplements)} : adhésion et/ou prépa)
              sont prélevés aujourd&apos;hui.
            </p>
          )}
          <p className="mt-2 text-xs text-smoke">
            Votre carte est enregistrée pour les prélèvements automatiques jusqu&apos;en
            juin.
          </p>
        </div>
      )}

      <PaymentElement />
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <ButtonAction
        type="submit"
        size="lg"
        disabled={!stripe || loading}
        className="w-full"
      >
        {loading
          ? "Paiement en cours…"
          : `Payer ${euro(plan.premierPrelevement)} aujourd'hui`}
      </ButtonAction>
    </form>
  );
}
