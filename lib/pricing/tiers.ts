/**
 * What a plan unlocks that the server checks (lib/pricing/plan-features.ts): the plan
 * that lists a feature in `unlocks` has it, and so does every plan above it. The
 * pricing page prints its cards and its comparison table from this file only
 * (cardFeatures and COMPARISON_ROWS below), and the app's locks read the same
 * (components/domain/pricing/plan-lock.tsx). tests/unit/pricing/pricing-parity.test.tsx
 * holds the page to this file and to the server's gates.
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
  /** The pricing card's first lines: brands, engines, how often. */
  highlights: string[];
  /** The card's last lines, after its seats and what it unlocks (cardFeatures below). */
  extras: string[];
  unlocks: PlanFeature[];
  /** The plan below whose features this one has too: "Everything in Agency" on its card. */
  everythingIn?: string;
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
    highlights: ["1 brand", "2 AI engines", "1 audit per month"],
    extras: [],
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
    highlights: ["1 brand", "4 AI engines", "Weekly automated audits"],
    extras: ["Action items & recommendations", "Email reports"],
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
    highlights: ["1 brand", "4 AI engines", "3x weekly audits"],
    extras: ["Drift detection alerts", "Competitor tracking", "PDF export"],
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
    highlights: ["5 brands", "4 AI engines", "Daily automated audits"],
    extras: ["Priority support"],
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
    everythingIn: "agency",
    highlights: ["25 brands", "4 AI engines", "2x daily audits"],
    extras: ["Dedicated support"],
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
    everythingIn: "agency_pro",
    highlights: ["Unlimited brands", "Custom audit frequency"],
    extras: ["SSO & SAML", "SLA guarantee", "Dedicated account manager", "Custom integrations"],
  },
];

/**
 * Sri's decision 1 (7 Nov): every plan is scored the same way, so every plan's card and the
 * comparison table say so, in these words (cardFeatures and COMPARISON_ROWS below).
 * Methodology v2.2 (7 Nov), part 5: in words that say what's measured -- one score, the
 * Visibility (the share of answers that name the business), shown with where it's placed and
 * which sources the answers cite, both counts. Sentiment and Context aren't measured yet
 * (lib/scoring/dimension-result.ts), so "5-dimension scoring" claimed more than the product does.
 */
export const SCORING_LINE =
  "Visibility score (how often AI names you), with position and source citations";

export const ONE_OFF_AUDIT_PRICE_CENTS_INC_GST = 29900;

/**
 * Sri's decision 3 (7 Nov): the one-off audit can't be bought yet -- nothing calls
 * lib/stripe/checkout.ts's createOneOffCheckoutSession, and a paid one is only logged
 * (lib/stripe/webhook-handlers/payment-completed.ts) -- so its card is hidden everywhere
 * until it can. Its code stays; turning it back on is this one line.
 */
export const ONE_OFF_AUDIT_AVAILABLE: boolean = false;

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
  // 8 Nov (brand-feature locks and pricing claims, part 2): no page sets GA4 up -- the measurement id and
  // secret are saved through POST /api/agency/ga4-config only -- so the plan says so.
  ga4: {
    name: "GA4 integration (set up via API)",
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

/** "1 team seat", "5 team seats", "Unlimited team seats". */
export function seatsText(tier: TierDefinition): string {
  if (tier.seats < 0) return "Unlimited team seats";
  return `${tier.seats} team ${tier.seats === 1 ? "seat" : "seats"}`;
}

/**
 * 6 Nov -- a plan's pricing card, top to bottom: its highlights, how it's scored (the same on
 * every plan), its seats, the plan it has everything in, the features it unlocks (in the app's
 * own words), then the rest.
 */
export function cardFeatures(tier: TierDefinition): string[] {
  const below = tier.everythingIn ? getTierDefinition(tier.everythingIn) : undefined;
  return [
    ...tier.highlights,
    SCORING_LINE,
    seatsText(tier),
    ...(below ? [`Everything in ${below.name}`] : []),
    ...tier.unlocks.map((feature) => PLAN_FEATURE_COPY[feature].name),
    ...tier.extras,
  ];
}

/**
 * 6 Nov -- the pricing page's comparison table. A `feature` row is ticked where the
 * server allows the feature (planIncludes, the rule lib/pricing/plan-features.ts
 * checks); a `from` row from that plan up; a `value` row prints each plan's own.
 */
export type ComparisonRow =
  | { label: string; value: (tier: TierDefinition) => string }
  | { label: string; from: string }
  | { feature: PlanFeature };

export const COMPARISON_ROWS: ComparisonRow[] = [
  { label: "Brands", value: (t) => (t.brands < 0 ? "Unlimited" : String(t.brands)) },
  { label: "Team seats", value: (t) => (t.seats < 0 ? "Unlimited" : String(t.seats)) },
  { label: "AI engines", value: (t) => String(t.engines) },
  { label: "Audit frequency", value: (t) => t.frequency },
  { label: SCORING_LINE, from: "free" },
  { label: "Action items", from: "starter" },
  { label: "Drift alerts", from: "growth" },
  { label: "Competitor tracking", from: "growth" },
  { label: "PDF export", from: "growth" },
  { feature: "client_portal" },
  { feature: "white_label_reports" },
  { feature: "webhooks" },
  { feature: "bulk_operations" },
  { feature: "ga4" },
  { label: "SSO / SAML", from: "enterprise" },
  { label: "Priority support", from: "agency" },
];

/** Whether a plan's cell on a row is ticked; null for a row of values. */
export function comparisonIncludes(row: ComparisonRow, tierKey: string): boolean | null {
  if ("feature" in row) return planIncludes(tierKey, row.feature);
  if ("from" in row) return tierRank(tierKey) >= tierRank(row.from);
  return null;
}
