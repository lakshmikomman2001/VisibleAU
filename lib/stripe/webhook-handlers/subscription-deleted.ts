import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { organizations, subscriptions } from "@/db/schema";
import type { WebhookTx } from "./types";

export async function handleSubscriptionDeleted(event: Stripe.Event, tx: WebhookTx) {
  const sub = event.data.object as Stripe.Subscription;

  const [existing] = await tx
    .select({ orgId: subscriptions.organizationId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));

  if (!existing) return;

  await tx
    .update(subscriptions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));

  await tx
    .update(organizations)
    .set({ tier: "free" as any, updatedAt: new Date() })
    .where(eq(organizations.id, existing.orgId));
}
