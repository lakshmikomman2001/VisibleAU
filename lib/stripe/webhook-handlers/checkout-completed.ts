import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { organizations, subscriptions } from "@/db/schema";
import { stripe } from "../client";
import { tierFromPriceId } from "../price-map";
import type { WebhookTx } from "./types";

interface CheckoutSubData {
  sub: Stripe.Subscription;
  priceId: string;
  tier: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Fetch subscription data from Stripe API — call BEFORE entering a transaction
 * so the outbound HTTP call doesn't hold a DB connection.
 */
export async function prepareCheckoutData(
  event: Stripe.Event,
): Promise<CheckoutSubData | null> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== "subscription") return null;

  const orgId = session.metadata?.organizationId;
  if (!orgId) throw new Error("Missing organizationId in checkout session metadata");

  const sub = await stripe.subscriptions.retrieve(session.subscription as string);
  const subData = sub as any;
  const priceId = sub.items.data[0].price.id;
  const tier = tierFromPriceId(priceId);
  const periodStart = subData.current_period_start
    ? new Date(subData.current_period_start * 1000)
    : new Date();
  const periodEnd = subData.current_period_end
    ? new Date(subData.current_period_end * 1000)
    : new Date();

  return { sub, priceId, tier, periodStart, periodEnd };
}

export async function handleCheckoutCompleted(
  event: Stripe.Event,
  tx: WebhookTx,
  data: CheckoutSubData,
) {
  const session = event.data.object as Stripe.Checkout.Session;
  const orgId = session.metadata!.organizationId!;
  const { sub, priceId, tier, periodStart, periodEnd } = data;

  await tx
    .insert(subscriptions)
    .values({
      organizationId: orgId,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      tier,
      billingInterval:
        sub.items.data[0].price.recurring?.interval === "year"
          ? "annual"
          : "monthly",
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.organizationId,
      set: {
        tier,
        status: sub.status,
        stripePriceId: priceId,
        stripeSubscriptionId: sub.id,
        stripeCustomerId: session.customer as string,
        billingInterval:
          sub.items.data[0].price.recurring?.interval === "year"
            ? "annual"
            : "monthly",
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        updatedAt: new Date(),
      },
    });

  await tx
    .update(organizations)
    .set({
      tier: tier as any,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: sub.id,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}
