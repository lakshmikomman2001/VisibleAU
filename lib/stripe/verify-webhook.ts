import type Stripe from "stripe";
import { getStripe } from "./client";

export async function verifyStripeWebhook(req: Request): Promise<Stripe.Event> {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) throw new Error("Missing stripe-signature header");
  return getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}
