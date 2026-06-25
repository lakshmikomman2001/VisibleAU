import type Stripe from "stripe";
import type { WebhookTx } from "./types";

export async function handlePaymentCompleted(event: Stripe.Event, _tx: WebhookTx) {
  const session = event.data.object as Stripe.Checkout.Session;
  const type = session.metadata?.type;

  if (type === "one_off_audit") {
    const brandId = session.metadata?.brandId;
    const orgId = session.metadata?.organizationId;
    if (!brandId || !orgId) return;
    console.log(`One-off audit purchased for brand ${brandId} in org ${orgId}`);
  }
}
