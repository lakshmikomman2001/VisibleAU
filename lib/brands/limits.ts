import { TIER_DEFINITIONS, tierRank } from "@/lib/pricing/tiers";

/**
 * How many brands each plan has, from lib/pricing/tiers.ts (the pricing page's own
 * figures; -1 there is unlimited). An unknown plan gets one.
 */
export const TIER_BRAND_LIMITS: Record<string, number> = Object.fromEntries(
  TIER_DEFINITIONS.map((t) => [t.key, t.brands < 0 ? Infinity : t.brands]),
);

function brandLimitFor(tier: string): number {
  return TIER_BRAND_LIMITS[tier] ?? 1;
}

/** POST /api/brands's check: may a workspace on `tier` with this many brands add one? */
export function checkBrandLimit(tier: string, currentBrandCount: number): boolean {
  return currentBrandCount < brandLimitFor(tier);
}

/** Where every "New brand" entry leads once the plan's brands are used up. */
export const BRAND_LIMIT_UPGRADE_HREF = "/settings/billing?reason=brand-limit";

export interface BrandUsage {
  count: number;
  /** null: the plan has no limit. */
  limit: number | null;
  /** checkBrandLimit's answer: false means the API would refuse a new brand. */
  canAdd: boolean;
  /** When it can't: the first plan up with more brands, e.g. "Agency". */
  upgradePlan: string | null;
}

/**
 * 6 Nov (phone-layout follow-ups, item 1) -- what every "New brand" entry shows: the
 * wizard while the plan has room, and the way to the plans once it doesn't. The
 * same rule as the API's refusal, so no entry opens a wizard that ends in a 403.
 */
export function brandUsage(tier: string, count: number): BrandUsage {
  const limit = brandLimitFor(tier);
  const canAdd = checkBrandLimit(tier, count);
  const upgrade = canAdd
    ? undefined
    : TIER_DEFINITIONS.find(
        (t) => tierRank(t.key) > tierRank(tier) && brandLimitFor(t.key) > limit,
      );
  return {
    count,
    limit: Number.isFinite(limit) ? limit : null,
    canAdd,
    upgradePlan: upgrade?.name ?? null,
  };
}
