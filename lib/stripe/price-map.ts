export type BillingInterval = "monthly" | "annual";

interface PriceEntry {
  monthly: string;
  annual: string;
}

const PRICE_MAP: Record<string, PriceEntry> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
    annual: process.env.STRIPE_PRICE_STARTER_ANNUAL!,
  },
  growth: {
    monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY!,
    annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL!,
  },
  agency: {
    monthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY!,
    annual: process.env.STRIPE_PRICE_AGENCY_ANNUAL!,
  },
  agency_pro: {
    monthly: process.env.STRIPE_PRICE_AGENCY_PRO_MONTHLY!,
    annual: process.env.STRIPE_PRICE_AGENCY_PRO_ANNUAL!,
  },
};

const ONE_OFF_PRICE = process.env.STRIPE_PRICE_ONE_OFF_AUDIT!;

export function priceIdForTier(tier: string, billing: BillingInterval): string {
  const entry = PRICE_MAP[tier];
  if (!entry) throw new Error(`No price mapping for tier: ${tier}`);
  return entry[billing];
}

export function tierFromPriceId(priceId: string): string {
  for (const [tier, entry] of Object.entries(PRICE_MAP)) {
    if (entry.monthly === priceId || entry.annual === priceId) return tier;
  }
  throw new Error(`Unknown price ID: ${priceId}`);
}

export function oneOffAuditPriceId(): string {
  return ONE_OFF_PRICE;
}

export function billingFromPriceId(priceId: string): BillingInterval {
  for (const entry of Object.values(PRICE_MAP)) {
    if (entry.monthly === priceId) return "monthly";
    if (entry.annual === priceId) return "annual";
  }
  return "monthly";
}
