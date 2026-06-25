import { stripe } from "./client";

export async function createPortalSession(params: {
  stripeCustomerId: string;
  returnUrl: string;
}) {
  return stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });
}
