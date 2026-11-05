/**
 * What a plan unlocks that the server checks (lib/pricing/plan-features.ts): the plan
 * that lists a feature in `unlocks` has it, and so does every plan above it.
 * tests/unit/pricing/plan-features.test.ts keeps these in step with what the pricing
 * page prints, and the app's locks read the same (components/domain/pricing/plan-lock.tsx).
 */
export type PlanFeature =
  | "client_portal"
  | "white_label_reports"
  | "webhooks"
  | "bulk_operations"
  | "ga4";

export interface TierDefinition {
  key: string;
  name: string;
  monthlyPriceCentsIncGst: number;
  annualPriceCentsIncGst: number;
  brands: number;
  /** Active members plus pending invites. -1 is unlimited. */
  seats: number;
  engines: number;
  frequency: string;
  features: string[];
  unlocks: PlanFeature[];
  popular?: boolean;
}

export const TIER_DEFINITIONS: TierDefinition[] = [
  {
    key: "free",
    name: "Free",
    monthlyPriceCentsIncGst: 0,
    annualPriceCentsIncGst: 0,
    brands: 1,
    seats: 1,
    engines: 2,
    frequency: "1 audit/month",
    unlocks: [],
    features: ["1 brand", "2 AI engines", "1 audit per month", "Basic visibility score"],
  },
  {
    key: "starter",
    name: "Starter",
    monthlyPriceCentsIncGst: 9900,
    annualPriceCentsIncGst: 99000,
    brands: 1,
    seats: 1,
    engines: 4,
    frequency: "Weekly audits",
    unlocks: [],
    features: [
      "1 brand",
      "4 AI engines",
      "Weekly automated audits",
      "Full 7-layer scoring",
      "Action items & recommendations",
      "Email reports",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    monthlyPriceCentsIncGst: 29900,
    annualPriceCentsIncGst: 299000,
    brands: 1,
    seats: 1,
    engines: 4,
    frequency: "3x/week audits",
    unlocks: [],
    popular: true,
    features: [
      "1 brand",
      "4 AI engines",
      "3x weekly audits",
      "Full 7-layer scoring",
      "Drift detection alerts",
      "Competitor tracking",
      "PDF export",
    ],
  },
  {
    key: "agency",
    name: "Agency",
    monthlyPriceCentsIncGst: 49900,
    annualPriceCentsIncGst: 499000,
    brands: 5,
    seats: 5,
    engines: 4,
    frequency: "Daily audits",
    unlocks: ["client_portal", "white_label_reports", "webhooks"],
    features: [
      "5 brands",
      "4 AI engines",
      "Daily automated audits",
      "Client portal",
      "White-label reports",
      "Webhook integrations",
      "Priority support",
    ],
  },
  {
    key: "agency_pro",
    name: "Agency Pro",
    monthlyPriceCentsIncGst: 149900,
    annualPriceCentsIncGst: 1499000,
    brands: 25,
    seats: 15,
    engines: 4,
    frequency: "2x daily audits",
    unlocks: ["bulk_operations", "ga4"],
    features: [
      "25 brands",
      "4 AI engines",
      "2x daily audits",
      "Everything in Agency",
      "Bulk operations",
      "GA4 integration",
      "Custom branding",
      "Dedicated support",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    monthlyPriceCentsIncGst: 0,
    annualPriceCentsIncGst: 0,
    brands: -1,
    seats: -1,
    engines: 4,
    frequency: "Custom",
    unlocks: [],
    features: [
      "Unlimited brands",
      "Custom audit frequency",
      "SSO & SAML",
      "SLA guarantee",
      "Dedicated account manager",
      "Custom integrations",
    ],
  },
];

export const ONE_OFF_AUDIT_PRICE_CENTS_INC_GST = 29900;

export function getTierDefinition(key: string): TierDefinition | undefined {
  return TIER_DEFINITIONS.find((t) => t.key === key);
}

/** The lowest plan with this feature. */
export function requiredTierFor(feature: PlanFeature): TierDefinition {
  const tier = TIER_DEFINITIONS.find((t) => t.unlocks.includes(feature));
  if (!tier) throw new Error(`No plan unlocks ${feature}`);
  return tier;
}

/** A plan's seats, Infinity for unlimited, and one for a plan nobody knows. */
export function seatLimitFor(key: string): number {
  const seats = getTierDefinition(key)?.seats ?? 1;
  return seats < 0 ? Number.POSITIVE_INFINITY : seats;
}

export function seatLimitMessage(seats: number): string {
  return `Your plan includes ${seats} ${seats === 1 ? "seat" : "seats"}`;
}

/** 6 Nov -- what the app and the pricing page call each feature, and what it does. */
export const PLAN_FEATURE_COPY: Record<PlanFeature, { name: string; description: string }> = {
  client_portal: {
    name: "Client portal",
    description: "A read-only page of a brand's results to share with your client",
  },
  white_label_reports: {
    name: "White-label report branding",
    description: "Your agency name and logo on reports",
  },
  webhooks: {
    name: "Webhook integrations",
    description: "Audit events sent to Slack, Discord, Airtable, email or your own endpoint",
  },
  bulk_operations: {
    name: "Bulk export and re-audit",
    description: "Re-run audits or export results for many brands at once",
  },
  ga4: {
    name: "GA4 integration",
    description: "Each finished audit sent to your Google Analytics 4 property",
  },
};

/** A plan's place in TIER_DEFINITIONS, lowest first; a plan nobody knows ranks with Free. */
export function tierRank(key: string): number {
  return Math.max(
    0,
    TIER_DEFINITIONS.findIndex((t) => t.key === key),
  );
}

/** Whether a plan has the feature: the plan that unlocks it does, and so does every plan above. */
export function planIncludes(tierKey: string, feature: PlanFeature): boolean {
  return tierRank(tierKey) >= tierRank(requiredTierFor(feature).key);
}

/** "Bulk export and re-audit is part of the Agency Pro plan". */
export function planLockedMessage(feature: PlanFeature): string {
  return `${PLAN_FEATURE_COPY[feature].name} is part of the ${requiredTierFor(feature).name} plan`;
}
