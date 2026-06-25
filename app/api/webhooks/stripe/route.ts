import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { processedWebhookEvents } from "@/db/schema";
import {
  handleCheckoutCompleted,
  prepareCheckoutData,
} from "@/lib/stripe/webhook-handlers/checkout-completed";
import { handleInvoicePaid } from "@/lib/stripe/webhook-handlers/invoice-paid";
import { handleInvoicePaymentFailed } from "@/lib/stripe/webhook-handlers/invoice-payment-failed";
import { handlePaymentCompleted } from "@/lib/stripe/webhook-handlers/payment-completed";
import { handleSubscriptionDeleted } from "@/lib/stripe/webhook-handlers/subscription-deleted";
import { handleSubscriptionUpdated } from "@/lib/stripe/webhook-handlers/subscription-updated";
import { verifyStripeWebhook } from "@/lib/stripe/verify-webhook";

export async function POST(req: Request) {
  let event;
  try {
    event = await verifyStripeWebhook(req);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Pre-fetch: outbound API calls BEFORE the transaction so we don't hold a
  // DB connection while waiting on Stripe's network.
  let checkoutData: Awaited<ReturnType<typeof prepareCheckoutData>> = null;
  if (event.type === "checkout.session.completed") {
    checkoutData = await prepareCheckoutData(event);
  }

  try {
    await db.transaction(async (tx) => {
      const already = await tx.query.processedWebhookEvents.findFirst({
        where: eq(processedWebhookEvents.stripeEventId, event.id),
      });
      if (already) return;

      switch (event.type) {
        case "checkout.session.completed":
          if (checkoutData) {
            await handleCheckoutCompleted(event, tx, checkoutData);
          }
          await handlePaymentCompleted(event, tx);
          break;
        case "customer.subscription.updated":
          await handleSubscriptionUpdated(event, tx);
          break;
        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event, tx);
          break;
        case "invoice.paid":
          await handleInvoicePaid(event, tx);
          break;
        case "invoice.payment_failed":
          await handleInvoicePaymentFailed(event, tx);
          break;
      }

      await tx
        .insert(processedWebhookEvents)
        .values({ stripeEventId: event.id, type: event.type })
        .onConflictDoNothing();
    });
  } catch (err: any) {
    if (err.code === "23505") {
      return Response.json({ received: true, duplicate: true });
    }
    throw err;
  }

  return Response.json({ received: true });
}
