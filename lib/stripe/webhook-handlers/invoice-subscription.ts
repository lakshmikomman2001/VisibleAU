import type Stripe from "stripe";

/**
 * 3 Nov -- the subscription an invoice event is about. From API version 2025-03-31
 * an invoice has no `subscription`; it's at parent.subscription_details.subscription.
 * A webhook endpoint keeps the API version it was created with, so read either. With
 * neither, say so, with the event's id and type only: on an endpoint that had moved
 * on, the handlers used to return without a word.
 */
interface OldShape {
  subscription?: string | { id: string } | null;
}

export function subscriptionIdOfInvoiceEvent(event: Stripe.Event): string | null {
  const invoice = event.data.object as Stripe.Invoice & OldShape;
  const subscription = invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
  if (subscription) return typeof subscription === "string" ? subscription : subscription.id;
  console.warn(
    JSON.stringify({
      event: "stripe_invoice_without_subscription",
      stripeEventId: event.id,
      type: event.type,
    }),
  );
  return null;
}
