/**
 * What a plan unlocks that the server checks (lib/pricing/plan-features.ts): the plan
 * that lists a feature in `unlocks` has it, and so does every plan above it. The
 * pricing page prints its cards and its comparison table from this file only
 * (cardFeatures and COMPARISON_ROWS below), and the app's locks read the same
 * (components/domain/pricing/plan-lock.tsx). tests/unit/pricing/pricing-parity.test.tsx
 * holds the page to this file and to the server's gates.
 */
/**
 * 8 Nov (brand-feature locks and pricing claims, part 3; Sri: "pricing promises must be true for a
 * one-person company today") -- what the cards and the table promise beyond the app itself, all of it here:
 * - support is email: hello@ and support@ addresses, no ticket queue, no response-time commitment. Agency
 *   (and the plans above, which have everything in it) is answered first: "Priority email support". Agency
 *   Pro's "Dedicated support" went: nobody is dedicated to one customer.
 * - Enterprise: "SSO & SAML" went (no SSO is set up: better-auth's SSO plugin isn't installed, and adding it
 *   is a build, not a switch), as did "SLA guarantee" (no written SLA exists) and "Dedicated account
 *   manager" (no account managers). "Custom integrations" is "(by arrangement)": built only by agreement.
 * tests/unit/pricing/pricing-claims.test.tsx holds the page to this.
 */
import { ENGINE_DISPLAY_NAMES, type Engine } from "@/lib/llm/interface";
import { auditModelFor } from "@/lib/llm/model-selector";
import { modelName } from "@/lib/llm/model-set";
import { TIER_ENGINES } from "@/lib/llm/tier-engines";
import {
  googleAiPlanLine,
  googleAiRowDescription,
  type PublicGoogleAi,
} from "@/lib/marketing/google-ai";

export const PRIORITY_EMAIL_SUPPORT = "Priority email support";

/**
 * 16 Nov (Sri: Google AI Overviews and AI Mode for every Growth, Agency and Agency Pro workspace): the plan Google's AI
 * answers start at. lib/governance/google-surfaces.ts GOOGLE_SURFACES_MIN_TIER is this constant, so the audit's gate
 * and the plans' lists can't differ.
 */
export const GOOGLE_AI_FROM_TIER = "growth";

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
  /**
   * 16 Nov: Google's AI answers (googleAiPlanLine) are on this plan's card -- only while the global setting has them
   * on (cardFeatures' `googleAi`, from lib/governance/google-surfaces.ts publicGoogleAi). Growth, Agency and Agency
   * Pro; never Starter or Free. Enterprise has them through "Everything in Agency Pro".
   */
  googleAi?: true;
  popular?: boolean;
  /**
   * S01 (LLD 7.6, 8.1.7; D-RT1 revised): the deepest report tier the plan can generate -- null for Free and Starter (no
   * reports), Growth Basic and Standard, Agency and up all three, chosen per report (D-RT2). Read through
   * lib/reports/report-tiers.ts (reportTierAllowed) by every server path.
   */
  maxReportTier: "basic" | "standard" | "enhanced" | null;
  /** S01 (D-RT3): the plan renames the three tiers and shows the name on the cover (Agency and up). */
  reportTierNames?: true;
}

export const TIER_DEFINITIONS: TierDefinition[] = [
  {
    key: "free",
    maxReportTier: null,
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
    maxReportTier: null,
    name: "Starter",
    monthlyPriceCentsIncGst: 9900,
    annualPriceCentsIncGst: 99000,
    brands: 1,
    seats: 1,
    engines: 4,
    frequency: "Weekly audits",
    unlocks: [],
    highlights: ["1 brand", "4 AI engines", "Weekly automated audits"],
    // S01 part 0 (D-RT1 revised): no "Email reports" -- reports are Growth and up (brand-features.ts).
    extras: ["Action items & recommendations"],
  },
  {
    key: "growth",
    maxReportTier: "standard",
    name: "Growth",
    monthlyPriceCentsIncGst: 29900,
    annualPriceCentsIncGst: 299000,
    brands: 1,
    seats: 1,
    engines: 4,
    frequency: "3x/week audits",
    unlocks: [],
    popular: true,
    googleAi: true,
    highlights: ["1 brand", "4 AI engines", "3x weekly audits"],
    extras: ["Drift detection alerts", "Competitor tracking", "PDF export"],
  },
  {
    key: "agency",
    maxReportTier: "enhanced",
    reportTierNames: true,
    name: "Agency",
    monthlyPriceCentsIncGst: 49900,
    annualPriceCentsIncGst: 499000,
    brands: 5,
    seats: 5,
    engines: 4,
    frequency: "Daily audits",
    unlocks: ["client_portal", "white_label_reports", "webhooks"],
    googleAi: true,
    highlights: ["5 brands", "4 AI engines", "Daily automated audits"],
    extras: [PRIORITY_EMAIL_SUPPORT],
  },
  {
    key: "agency_pro",
    maxReportTier: "enhanced",
    reportTierNames: true,
    name: "Agency Pro",
    monthlyPriceCentsIncGst: 149900,
    annualPriceCentsIncGst: 1499000,
    brands: 25,
    seats: 15,
    engines: 4,
    frequency: "2x daily audits",
    unlocks: ["bulk_operations", "ga4"],
    everythingIn: "agency",
    googleAi: true,
    highlights: ["25 brands", "4 AI engines", "2x daily audits"],
    extras: [],
  },
  {
    key: "enterprise",
    maxReportTier: "enhanced",
    reportTierNames: true,
    name: "Enterprise",
    monthlyPriceCentsIncGst: 0,
    annualPriceCentsIncGst: 0,
    brands: -1,
    seats: -1,
    engines: 4,
    // 9 Nov (mock-gate follow-ups, part 8): not "Custom". No setting changes a workspace's audit frequency:
    // a schedule takes its plan's (app/api/audit-schedules/route.ts, lib/scheduling/tier-limits.ts -- daily
    // for Enterprise), so any other frequency is a conversation, not a setting.
    frequency: "By arrangement",
    unlocks: [],
    everythingIn: "agency_pro",
    highlights: ["Unlimited brands", "Audit frequency by arrangement"],
    extras: ["Custom integrations (by arrangement)"],
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

/**
 * 12 Nov (Google AI follow-ups, part 6) -- the one way a plan is shown: its name here ("agency_pro" ->
 * "Agency Pro"), never its code. The sidebar showed "Agency_pro · AU", the user card "Agency_pro tier · AU"
 * and /admin/settings "Plan: agency_pro". A name passed in ("Agency") is found too. A code that isn't a
 * plan here is shown in words ("some_plan" -> "Some Plan"), never as it's stored.
 */
export function tierDisplayName(code: string): string {
  const def =
    getTierDefinition(code) ?? getTierDefinition(code.trim().toLowerCase().replace(/\s+/g, "_"));
  if (def) return def.name;
  return code
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

/** Every engine, in the order the plans list them (lib/llm/tier-engines.ts, a paid plan's). */
const ENGINE_ORDER: readonly Engine[] = TIER_ENGINES.starter ?? [];

/**
 * 19 Nov (Sri's review of /pricing): the model a plan's audits ask an engine for ("Haiku 4.5", "Sonnet 4.6",
 * lib/llm/model-selector.ts), or null when the plan doesn't use that engine.
 */
export function planModel(tierKey: string, engine: Engine): string | null {
  const engines = TIER_ENGINES[tierKey] ?? [];
  return engines.includes(engine) ? modelName(auditModelFor(tierKey, engine)) : null;
}

/**
 * The card's line naming each engine's model on the plan: "Models: ChatGPT (GPT-4.1 mini), Claude (Haiku 4.5),
 * Gemini (3.5 Flash-Lite), Perplexity (Sonar)". The models differ by plan, so "4 AI engines" alone hid it.
 */
export function planModelsLine(tierKey: string): string {
  const parts = ENGINE_ORDER.flatMap((engine) => {
    const model = planModel(tierKey, engine);
    return model ? [`${ENGINE_DISPLAY_NAMES[engine]} (${model})`] : [];
  });
  return `Models: ${parts.join(", ")}`;
}

/**
 * 6 Nov -- a plan's pricing card, top to bottom: its highlights, how it's scored (the same on
 * every plan), its seats, the plan it has everything in, the features it unlocks (in the app's
 * own words), then the rest. 19 Nov: after its highlights, the models it asks each engine for.
 * 16 Nov: after its highlights, Google's AI answers on a plan that has them -- only given `googleAi` (what
 * lib/governance/google-surfaces.ts publicGoogleAi says now; null while the global setting is off).
 */
export function cardFeatures(
  tier: TierDefinition,
  googleAi: PublicGoogleAi | null = null,
): string[] {
  const below = tier.everythingIn ? getTierDefinition(tier.everythingIn) : undefined;
  return [
    ...tier.highlights,
    planModelsLine(tier.key),
    ...(tier.googleAi && googleAi ? [googleAiPlanLine(googleAi.surfaces)] : []),
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
  | { label: string; from: string; description?: string }
  | { feature: PlanFeature };

export const COMPARISON_ROWS: ComparisonRow[] = [
  { label: "Brands", value: (t) => (t.brands < 0 ? "Unlimited" : String(t.brands)) },
  { label: "Team seats", value: (t) => (t.seats < 0 ? "Unlimited" : String(t.seats)) },
  { label: "AI engines", value: (t) => String(t.engines) },
  // 19 Nov: the model each engine answers with differs by plan (lib/llm/model-selector.ts); "—" where the plan
  // doesn't use the engine.
  ...ENGINE_ORDER.map(
    (engine): ComparisonRow => ({
      label: `${ENGINE_DISPLAY_NAMES[engine]} model`,
      value: (t) => planModel(t.key, engine) ?? "—",
    }),
  ),
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
  { label: PRIORITY_EMAIL_SUPPORT, from: "agency" },
];

/**
 * S01 part 8 (LLD 8.1.7, appendix E): the three report types' default names and what each contains, in appendix E's
 * plain words -- the one copy for the report contents panel's cards (P08), Report branding's table (P18), the pricing
 * page's "Reports" row and its footnote. lib/reports/report-tiers.ts re-exports them (DEFAULT_TIER_NAMES,
 * TIER_DESCRIPTIONS). No prices: report types are part of the plans.
 */
export const REPORT_TIER_DEFAULT_NAMES = {
  basic: "Basic",
  standard: "Standard",
  enhanced: "Enhanced",
} as const;
export const REPORT_TIER_DESCRIPTIONS = {
  basic:
    "Score, engine by engine, Google Search AI, where AI looks, competitors, trend, and why your score is what it is.",
  standard:
    "Everything in Basic, plus an action plan: what to do next, the evidence for each action, and what was done since the last report.",
  enhanced:
    "Everything in Standard, plus checks beyond AI answers: business identity and ABN, YouTube, AI crawler access, website technical health and your directory profiles.",
} as const;
const REPORT_TIER_ORDER = ["basic", "standard", "enhanced"] as const;

export const REPORTS_ROW_LABEL = "Reports";

/**
 * A plan's cell on the "Reports" row, from its maxReportTier and reportTierNames (never a list of plans): "—" with no
 * reports (Free, Starter), "Basic and Standard" (Growth), "Basic, Standard and Enhanced, chosen per client report,
 * with your own names" (Agency plans).
 */
export function reportsRowValue(tier: TierDefinition): string {
  if (tier.maxReportTier === null) return "—";
  const names = REPORT_TIER_ORDER.slice(0, REPORT_TIER_ORDER.indexOf(tier.maxReportTier) + 1).map(
    (t) => REPORT_TIER_DEFAULT_NAMES[t],
  );
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return tier.reportTierNames ? `${list}, chosen per client report, with your own names` : list;
}

/** The row's footnote: what each report type contains (appendix E). */
export function reportsFootnote(): string[] {
  return REPORT_TIER_ORDER.map(
    (t) => `${REPORT_TIER_DEFAULT_NAMES[t]}: ${REPORT_TIER_DESCRIPTIONS[t]}`,
  );
}

const REPORTS_ROW: ComparisonRow = { label: REPORTS_ROW_LABEL, value: reportsRowValue };

/**
 * 16 Nov: the table's rows, with Google's AI answers after the Growth rows while the global setting has them on
 * (`googleAi`, from publicGoogleAi), ticked from GOOGLE_AI_FROM_TIER up; COMPARISON_ROWS as they are otherwise.
 * S01 part 8: with `reportTiers` (report_v2 on globally: components/domain/pricing/load-report-tiers-claim.ts), the
 * "Reports" row right after "PDF export".
 */
export function comparisonRows(
  googleAi: PublicGoogleAi | null,
  options: { reportTiers?: boolean } = {},
): ComparisonRow[] {
  const rows = rowsWithGoogleAi(googleAi);
  if (!options.reportTiers) return rows;
  const at = rows.findIndex((r) => "label" in r && r.label === "PDF export");
  return [...rows.slice(0, at + 1), REPORTS_ROW, ...rows.slice(at + 1)];
}

function rowsWithGoogleAi(googleAi: PublicGoogleAi | null): ComparisonRow[] {
  if (!googleAi) return COMPARISON_ROWS;
  // 19 Nov: with the grey line the rows below have: its own section, the score, where it's checked from.
  const row: ComparisonRow = {
    label: googleAiPlanLine(googleAi.surfaces),
    from: GOOGLE_AI_FROM_TIER,
    description: googleAiRowDescription(googleAi),
  };
  const lastFromRow = COMPARISON_ROWS.reduce(
    (at, r, i) => ("from" in r && r.from === GOOGLE_AI_FROM_TIER ? i : at),
    -1,
  );
  return [
    ...COMPARISON_ROWS.slice(0, lastFromRow + 1),
    row,
    ...COMPARISON_ROWS.slice(lastFromRow + 1),
  ];
}

/** Whether a plan's cell on a row is ticked; null for a row of values. */
export function comparisonIncludes(row: ComparisonRow, tierKey: string): boolean | null {
  if ("feature" in row) return planIncludes(tierKey, row.feature);
  if ("from" in row) return tierRank(tierKey) >= tierRank(row.from);
  return null;
}
