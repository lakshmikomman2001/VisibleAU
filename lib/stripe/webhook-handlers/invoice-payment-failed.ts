import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { subscriptions } from "@/db/schema";
import type { WebhookTx } from "./types";

export async function handleInvoicePaymentFailed(event: Stripe.Event, tx: WebhookTx) {
  const invoice = event.data.object as any;
  if (!invoice.subscription) return;

  await tx
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(
      eq(subscriptions.stripeSubscriptionId, String(invoice.subscription)),
    );
}
