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

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!pk) return null;
  if (!stripePromise) stripePromise = loadStripe(pk);
  return stripePromise;
}

export function StripePayment({
  clientSecret,
  adherentId,
  montantEcheance,
  nbEcheances,
  onSuccess,
}: {
  clientSecret: string;
  adherentId: string;
  montantEcheance: number;
  nbEcheances: number;
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
        clientSecret,
        appearance: {
          theme: "flat",
          variables: {
            colorPrimary: "#FF6B00",
            colorBackground: "#ffffff",
            borderRadius: "12px",
            fontFamily: "Manrope, system-ui, sans-serif",
          },
        },
      }}
    >
      <PaymentInner
        adherentId={adherentId}
        montantEcheance={montantEcheance}
        nbEcheances={nbEcheances}
        onSuccess={onSuccess}
      />
    </Elements>
  );
}

function PaymentInner({
  adherentId,
  montantEcheance,
  nbEcheances,
  onSuccess,
}: {
  adherentId: string;
  montantEcheance: number;
  nbEcheances: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError("");

    const { error: submitErr } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (submitErr) {
      setError(submitErr.message || "Le paiement a échoué.");
      setLoading(false);
      return;
    }

    // Filet de sécurité serveur (si le webhook n'est pas configuré).
    try {
      await fetch("/api/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adherentId }),
      });
    } catch {
      /* le webhook prendra le relais */
    }
    onSuccess();
  }

  return (
    <form onSubmit={pay} className="space-y-5">
      {nbEcheances > 1 && (
        <div className="rounded-xl border border-orange/20 bg-orange-50 p-4 text-sm text-ink">
          Paiement en <strong>{nbEcheances} fois</strong>. Première échéance
          aujourd&apos;hui : <strong>{euro(montantEcheance)}</strong>. Les{" "}
          {nbEcheances - 1} suivantes seront prélevées sur la carte enregistrée.
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
        {loading ? "Paiement en cours…" : `Payer ${euro(montantEcheance)}`}
      </ButtonAction>
    </form>
  );
}
