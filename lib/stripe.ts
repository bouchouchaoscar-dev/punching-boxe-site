import Stripe from "stripe";

let stripe: Stripe | null = null;

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe non configuré (STRIPE_SECRET_KEY manquant).");
  }
  if (!stripe) {
    // apiVersion non figée : on suit la version par défaut du compte
    // (évite les écarts de typage entre versions du SDK).
    stripe = new Stripe(key);
  }
  return stripe;
}
