import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { organizations, subscriptions, type Tier } from "@/db/schema";
import { getStripe } from "../client";
import { tierFromPriceId } from "../price-map";
import { periodColumns } from "./subscription-period";
import type { WebhookTx } from "./types";

interface CheckoutSubData {
  sub: Stripe.Subscription;
  priceId: string;
  tier: string;
  /** Both ends or neither (subscription-period.ts): a new row then has no period, an existing one keeps its own. */
  period: ReturnType<typeof periodColumns>;
}

/**
 * Fetch subscription data from Stripe API — call BEFORE entering a transaction
 * so the outbound HTTP call doesn't hold a DB connection.
 */
export async function prepareCheckoutData(event: Stripe.Event): Promise<CheckoutSubData | null> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== "subscription") return null;

  const orgId = session.metadata?.organizationId;
  if (!orgId) throw new Error("Missing organizationId in checkout session metadata");

  const sub = await getStripe().subscriptions.retrieve(session.subscription as string);
  const priceId = sub.items.data[0].price.id;
  const tier = tierFromPriceId(priceId);
  const period = periodColumns(sub, { stripeEventId: event.id, type: event.type });

  return { sub, priceId, tier, period };
}

export async function handleCheckoutCompleted(
  event: Stripe.Event,
  tx: WebhookTx,
  data: CheckoutSubData,
) {
  const session = event.data.object as Stripe.Checkout.Session;
  const orgId = session.metadata!.organizationId!;
  const { sub, priceId, tier, period } = data;

  await tx
    .insert(subscriptions)
    .values({
      organizationId: orgId,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      tier,
      billingInterval:
        sub.items.data[0].price.recurring?.interval === "year" ? "annual" : "monthly",
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      ...period,
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
          sub.items.data[0].price.recurring?.interval === "year" ? "annual" : "monthly",
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        ...period,
        updatedAt: new Date(),
      },
    });

  await tx
    .update(organizations)
    .set({
      tier: tier as Tier,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: sub.id,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}
