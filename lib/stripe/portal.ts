import { getStripe } from "./client";

export async function createPortalSession(params: {
  stripeCustomerId: string;
  returnUrl: string;
}) {
  return getStripe().billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });
}
