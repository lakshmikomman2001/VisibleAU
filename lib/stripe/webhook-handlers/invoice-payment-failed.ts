import { and, eq, notInArray } from "drizzle-orm";
import type Stripe from "stripe";
import { subscriptions } from "@/db/schema";
import { ENDED_SUBSCRIPTION_STATUSES } from "@/lib/pricing/effective-tier";
import type { WebhookTx } from "./types";

export async function handleInvoicePaymentFailed(event: Stripe.Event, tx: WebhookTx) {
  const invoice = event.data.object as any;
  if (!invoice.subscription) return;

  await tx
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(
      and(
        eq(subscriptions.stripeSubscriptionId, String(invoice.subscription)),
        // A late invoice event can't bring a cancelled subscription back.
        notInArray(subscriptions.status, [...ENDED_SUBSCRIPTION_STATUSES]),
      ),
    );
}
