import type Stripe from "stripe";
import { stripe } from "./client";

export async function verifyStripeWebhook(req: Request): Promise<Stripe.Event> {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) throw new Error("Missing stripe-signature header");
  return stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!,
  );
}
