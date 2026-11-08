import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { organizations, subscriptions, type Tier } from "@/db/schema";
import { isEndedSubscriptionStatus } from "@/lib/pricing/effective-tier";
import { tierFromPriceId } from "../price-map";
import { periodColumns } from "./subscription-period";
import type { WebhookTx } from "./types";

export async function handleSubscriptionUpdated(event: Stripe.Event, tx: WebhookTx) {
  const sub = event.data.object as Stripe.Subscription;

  const [existing] = await tx
    .select({ orgId: subscriptions.organizationId, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));

  if (!existing) return;
  // Stripe doesn't promise order, and never brings a cancelled subscription
  // back: this is an older event arriving late. Paying again is a new one.
  if (isEndedSubscriptionStatus(existing.status)) return;

  const priceId = sub.items.data[0].price.id;
  const tier = tierFromPriceId(priceId);

  await tx
    .update(subscriptions)
    .set({
      tier,
      status: sub.status,
      stripePriceId: priceId,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      // Both ends or neither: an event without a usable period keeps the stored one (subscription-period.ts).
      ...periodColumns(sub, { stripeEventId: event.id, type: event.type }),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));

  await tx
    .update(organizations)
    .set({ tier: tier as Tier, updatedAt: new Date() })
    .where(eq(organizations.id, existing.orgId));
}
