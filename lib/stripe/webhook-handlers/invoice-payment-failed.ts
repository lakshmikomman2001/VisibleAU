import { and, eq, notInArray } from "drizzle-orm";
import type Stripe from "stripe";
import { subscriptions } from "@/db/schema";
import { ENDED_SUBSCRIPTION_STATUSES } from "@/lib/pricing/effective-tier";
import { subscriptionIdOfInvoiceEvent } from "./invoice-subscription";
import type { WebhookTx } from "./types";

export async function handleInvoicePaymentFailed(event: Stripe.Event, tx: WebhookTx) {
  const subscriptionId = subscriptionIdOfInvoiceEvent(event);
  if (!subscriptionId) return;

  await tx
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(
      and(
        eq(subscriptions.stripeSubscriptionId, subscriptionId),
        // A late invoice event can't bring a cancelled subscription back.
        notInArray(subscriptions.status, [...ENDED_SUBSCRIPTION_STATUSES]),
      ),
    );
}
