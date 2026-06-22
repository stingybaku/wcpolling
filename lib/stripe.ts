import Stripe from "stripe";

// Lazily-constructed Stripe client. Kept lazy so the app (and `next build`)
// boots even when Stripe is not configured — the upgrade/webhook routes call
// getStripe() and surface a clear error only when payments are actually used.
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client = new Stripe(key);
  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
