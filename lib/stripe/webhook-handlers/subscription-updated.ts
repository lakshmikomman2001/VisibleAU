import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { organizations, subscriptions } from "@/db/schema";
import { tierFromPriceId } from "../price-map";
import type { WebhookTx } from "./types";

export async function handleSubscriptionUpdated(event: Stripe.Event, tx: WebhookTx) {
  const sub = event.data.object as Stripe.Subscription;

  const [existing] = await tx
    .select({ orgId: subscriptions.organizationId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));

  if (!existing) return;

  const priceId = sub.items.data[0].price.id;
  const tier = tierFromPriceId(priceId);

  const subData = sub as any;
  const periodEnd = subData.current_period_end
    ? new Date(subData.current_period_end * 1000)
    : undefined;

  await tx
    .update(subscriptions)
    .set({
      tier,
      status: sub.status,
      stripePriceId: priceId,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      ...(periodEnd && { currentPeriodEnd: periodEnd }),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));

  await tx
    .update(organizations)
    .set({ tier: tier as any, updatedAt: new Date() })
    .where(eq(organizations.id, existing.orgId));
}
