import { getTierDefinition } from "@/lib/pricing/tiers";

/**
 * S01 (LLD 8.1.7, R6, decisions D-RT1 revised and D-RT2/D-RT3): report tiers -- Basic, Standard, Enhanced -- three depths
 * of the same report, built from the same basis audit and the same data functions. Each plan sets the deepest tier it
 * can generate (tiers.ts `maxReportTier`); every server path checks a tier with `reportTierAllowed`, and the page set is
 * derived on the server from the tier (`pagesForTier`), never from what a request sends.
 */

export const REPORT_TIERS = ["basic", "standard", "enhanced"] as const;
export type ReportTier = (typeof REPORT_TIERS)[number];

export const DEFAULT_TIER_NAMES: Record<ReportTier, string> = {
  basic: "Basic",
  standard: "Standard",
  enhanced: "Enhanced",
};

/** Appendix E: what each tier contains, in plain words (the P08 cards, the pricing footnote, P18's table). */
export const TIER_DESCRIPTIONS: Record<ReportTier, string> = {
  basic:
    "Score, engine by engine, Google Search AI, where AI looks, competitors, trend, and why your score is what it is.",
  standard:
    "Everything in Basic, plus an action plan: what to do next, the evidence for each action, and what was done since the last report.",
  enhanced:
    "Everything in Standard, plus checks beyond AI answers: business identity and ABN, YouTube, AI crawler access, website technical health and your directory profiles.",
};

export function isReportTier(value: unknown): value is ReportTier {
  return typeof value === "string" && (REPORT_TIERS as readonly string[]).includes(value);
}

export function tierRankOf(tier: ReportTier): number {
  return REPORT_TIERS.indexOf(tier);
}

/** The deepest tier a plan can generate; null for a plan with no reports (Free, Starter: D-RT1 revised). */
export function maxReportTierFor(plan: string): ReportTier | null {
  return getTierDefinition(plan)?.maxReportTier ?? null;
}

/** The one check every server path uses: the plan has reports and the tier is at or below its deepest. */
export function reportTierAllowed(plan: string, tier: ReportTier): boolean {
  const max = maxReportTierFor(plan);
  return max !== null && tierRankOf(tier) <= tierRankOf(max);
}

/** The tiers a plan can generate, in order (empty for Free and Starter). */
export function tiersForPlan(plan: string): ReportTier[] {
  return REPORT_TIERS.filter((t) => reportTierAllowed(plan, t));
}

/** A requested tier capped at the plan (scheduled reports: the cap is logged by the caller). */
export function capTierAtPlan(plan: string, tier: ReportTier): ReportTier | null {
  const max = maxReportTierFor(plan);
  if (max === null) return null;
  return tierRankOf(tier) <= tierRankOf(max) ? tier : max;
}

/** Whether the plan can rename the tiers and show the name on the cover (Agency and up: D-RT3). */
export function planNamesTiers(plan: string): boolean {
  return getTierDefinition(plan)?.reportTierNames === true;
}

/** The lowest plan that can generate a tier ("Agency" for Enhanced), for "Available on {plan} and up". */
export function lowestPlanForTier(tier: ReportTier): string | null {
  for (const key of ["free", "starter", "growth", "agency", "agency_pro", "enterprise"]) {
    if (reportTierAllowed(key, tier)) return getTierDefinition(key)?.name ?? null;
  }
  return null;
}

export type ReportSectionKey =
  | "cover"
  | "summary"
  | "engines"
  | "google"
  | "directories"
  | "competitors"
  | "diagnosis"
  | "next"
  | "beyond_ai"
  | "trend"
  | "recommended"
  | "method";

/**
 * The PDF's page set for a tier (appendix D `sections`): Basic keeps today's pages (Diagnosis, and the prioritised list
 * on the Over time page); Standard turns Diagnosis into "Why, and what to do next" and drops the prioritised list (it
 * moves into What to do next); Enhanced adds "Beyond AI answers" after it. Google and Competitors still follow the
 * audit and the report template, as today.
 */
export function pagesForTier(tier: ReportTier): ReportSectionKey[] {
  const base: ReportSectionKey[] = [
    "cover",
    "summary",
    "engines",
    "google",
    "directories",
    "competitors",
  ];
  if (tier === "basic") return [...base, "diagnosis", "trend", "recommended", "method"];
  if (tier === "standard") return [...base, "next", "trend", "method"];
  return [...base, "next", "beyond_ai", "trend", "method"];
}

export interface TierNames {
  basic: string;
  standard: string;
  enhanced: string;
}

/** The workspace's names (report_tier_names, Agency and up), each falling back to the default name. */
export function tierNamesFrom(stored: unknown, plan: string): TierNames {
  if (!planNamesTiers(plan) || typeof stored !== "object" || stored === null)
    return { ...DEFAULT_TIER_NAMES };
  const s = stored as Record<string, unknown>;
  const pick = (t: ReportTier) => {
    const v = typeof s[t] === "string" ? (s[t] as string).trim() : "";
    return v.length > 0 ? v : DEFAULT_TIER_NAMES[t];
  };
  return { basic: pick("basic"), standard: pick("standard"), enhanced: pick("enhanced") };
}
