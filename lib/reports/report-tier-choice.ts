import { and, desc, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { agencyBrandAssets, reportBrandPreferences } from "@/db/schema";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import {
  capTierAtPlan,
  lowestPlanForTier,
  maxReportTierFor,
  REPORT_TIERS,
  type ReportTier,
  reportTierAllowed,
  TIER_DESCRIPTIONS,
  type TierNames,
  tierNamesFrom,
} from "./report-tiers";

/**
 * S01 part 8 (LLD 8.1.7, D-RT1 revised, D-RT2; contract P08.tier, P08.overLimit): which tier a report is, decided on
 * the server from the workspace's live plan. One function for the generate route, the generator (manual and scheduled
 * reports), the report contents panel's view, the default-tier save and the delivery-schedule form:
 * - a requested tier is kept when the plan includes it; above the plan it is "over the limit" (the route answers 402
 *   report_tier_not_in_plan; the generator caps it at the plan and logs the cap for operators);
 * - with no tier requested: the brand's saved default (report_brand_preferences.default_tier) when the plan includes
 *   it, else the plan's highest tier;
 * - null for a plan with no reports (Free, Starter): the existing Growth gate refuses those first.
 * The names are the workspace's own (report_tier_names, Agency and up: D-RT3), else Basic, Standard and Enhanced.
 */

/** LLD amendment 30: over a limit inside a feature the plan has -- 402 with this code, handled inline (P08.overLimit). */
export const REPORT_TIER_NOT_IN_PLAN = "report_tier_not_in_plan";

/** P08.states.overLimit's words. */
export function tierOverLimitMessage(highestName: string): string {
  return `Your plan now includes reports up to ${highestName}. Choose another report type.`;
}

/** The workspace row's report_tier_names (brand_id IS NULL; the newest wins if duplicated), resolved for the plan. */
export async function loadTierNames(
  db: DbClient,
  organizationId: string,
  plan: string,
): Promise<TierNames> {
  const [row] = await db
    .select({ names: agencyBrandAssets.reportTierNames })
    .from(agencyBrandAssets)
    .where(
      and(eq(agencyBrandAssets.organizationId, organizationId), isNull(agencyBrandAssets.brandId)),
    )
    .orderBy(desc(agencyBrandAssets.updatedAt), desc(agencyBrandAssets.id))
    .limit(1);
  return tierNamesFrom(row?.names, plan);
}

/** One P08 card: the name shown, appendix E's plain description, and the plan it needs when this plan lacks it. */
export interface TierOption {
  tier: ReportTier;
  name: string;
  description: string;
  /** "Agency" for a tier above the plan ("Available on Agency and up"); null when the plan includes it. */
  lockedPlan: string | null;
}

export function tierOptionsFor(plan: string, names: TierNames): TierOption[] {
  return REPORT_TIERS.map((tier) => ({
    tier,
    name: names[tier],
    description: TIER_DESCRIPTIONS[tier],
    lockedPlan: reportTierAllowed(plan, tier) ? null : (lowestPlanForTier(tier) ?? "a higher plan"),
  }));
}

export interface ReportTierChoice {
  /** The workspace's live plan key (effectiveTier). */
  plan: string;
  /** The plan's deepest tier; null for a plan with no reports. */
  maxTier: ReportTier | null;
  names: TierNames;
  /** What the report will be (a requested tier above the plan capped at it); null when the plan has no reports. */
  tier: ReportTier | null;
  /** A tier was requested and the plan doesn't include it. */
  overLimit: boolean;
  /** The brand's saved default, as stored (null: none). */
  savedDefault: ReportTier | null;
}

export async function chooseReportTier(
  db: DbClient,
  input: { organizationId: string; brandId: string; requested?: ReportTier | null; plan?: string },
): Promise<ReportTierChoice> {
  const plan = input.plan ?? (await effectiveTier(db, input.organizationId));
  const [names, [prefs]] = await Promise.all([
    loadTierNames(db, input.organizationId, plan),
    db
      .select({ defaultTier: reportBrandPreferences.defaultTier })
      .from(reportBrandPreferences)
      .where(eq(reportBrandPreferences.brandId, input.brandId)),
  ]);
  const maxTier = maxReportTierFor(plan);
  const savedDefault = prefs?.defaultTier ?? null;
  const requested = input.requested ?? null;
  if (requested) {
    const allowed = reportTierAllowed(plan, requested);
    return {
      plan,
      maxTier,
      names,
      tier: allowed ? requested : capTierAtPlan(plan, requested),
      overLimit: !allowed,
      savedDefault,
    };
  }
  const tier = savedDefault && reportTierAllowed(plan, savedDefault) ? savedDefault : maxTier;
  return { plan, maxTier, names, tier, overLimit: false, savedDefault };
}

/** The 402 body for a tier above the plan: P08 shows `error` inline and falls back to `maxTier`. */
export function tierNotInPlanBody(choice: ReportTierChoice): {
  error: string;
  code: typeof REPORT_TIER_NOT_IN_PLAN;
  maxTier: ReportTier | null;
} {
  const highest = choice.maxTier ? choice.names[choice.maxTier] : choice.names.basic;
  return {
    error: tierOverLimitMessage(highest),
    code: REPORT_TIER_NOT_IN_PLAN,
    maxTier: choice.maxTier,
  };
}

/** The workspace's tiers for a form that isn't about one brand (the delivery-schedule form's "Report type"). */
export async function workspaceTierOptions(
  db: DbClient,
  organizationId: string,
): Promise<{ plan: string; maxTier: ReportTier | null; options: TierOption[] }> {
  const plan = await effectiveTier(db, organizationId);
  const names = await loadTierNames(db, organizationId, plan);
  return { plan, maxTier: maxReportTierFor(plan), options: tierOptionsFor(plan, names) };
}

/** S01 part 10 (P17): the workspace's report names for its live plan (Agency and up rename them; else the defaults). */
export async function workspaceTierNames(db: DbClient, organizationId: string): Promise<TierNames> {
  return loadTierNames(db, organizationId, await effectiveTier(db, organizationId));
}
