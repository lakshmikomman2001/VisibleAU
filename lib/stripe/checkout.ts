import type { BillingInterval } from "./price-map";
import { stripe } from "./client";
import { oneOffAuditPriceId, priceIdForTier } from "./price-map";

interface CheckoutParams {
  tier: string;
  billing: BillingInterval;
  organizationId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(params: CheckoutParams) {
  const priceId = priceIdForTier(params.tier, params.billing);

  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: params.customerEmail,
    client_reference_id: params.organizationId,
    metadata: { organizationId: params.organizationId },
    subscription_data: {
      metadata: { organizationId: params.organizationId },
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
    automatic_tax: { enabled: false },
  });
}

interface OneOffCheckoutParams {
  organizationId: string;
  brandId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createOneOffCheckoutSession(params: OneOffCheckoutParams) {
  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: oneOffAuditPriceId(), quantity: 1 }],
    customer_email: params.customerEmail,
    client_reference_id: params.organizationId,
    metadata: {
      organizationId: params.organizationId,
      brandId: params.brandId,
      type: "one_off_audit",
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    automatic_tax: { enabled: false },
  });
}
