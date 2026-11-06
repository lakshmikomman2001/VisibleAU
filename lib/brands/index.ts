import { and, count, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import type { Brand, Organization } from "@/db/schema";
import { brands } from "@/db/schema";
import { seatLimitFor, TIER_DEFINITIONS, tierRank } from "@/lib/pricing/tiers";

export { checkBrandLimit, TIER_BRAND_LIMITS } from "./limits";

// Team RBAC (org_members) is Agency+ (LLD 4191/4211); lower tiers have the feature LOCKED (1 = owner only).
// TODO(seats): viewer-role invites currently COUNT toward the limit; revisit exempting 'viewer'.
export const TIER_SEAT_LIMITS: Record<string, number> = Object.fromEntries(
  TIER_DEFINITIONS.map((t) => [t.key, seatLimitFor(t.key)]),
);

/** Each plan's place in lib/pricing/tiers.ts's order, lowest first. */
export const TIER_RANK: Record<string, number> = Object.fromEntries(
  TIER_DEFINITIONS.map((t) => [t.key, tierRank(t.key)]),
);

export function isTierAtLeast(currentTier: string, requiredTier: string): boolean {
  return (TIER_RANK[currentTier] ?? 0) >= (TIER_RANK[requiredTier] ?? 0);
}

export async function getBrandForOrg(
  brandId: string,
  orgId: string,
  dbClient: DbClient,
): Promise<Brand | null> {
  const [brand] = await dbClient
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.organizationId, orgId), isNull(brands.deletedAt)));
  return brand ?? null;
}

export function inheritRegion(org: Organization): Organization["region"] {
  return org.region;
}

/** The workspace's brands that count toward its plan: the ones not deleted, as POST /api/brands counts. */
export async function countBrands(dbClient: DbClient, orgId: string): Promise<number> {
  const [row] = await dbClient
    .select({ count: count() })
    .from(brands)
    .where(and(eq(brands.organizationId, orgId), isNull(brands.deletedAt)));
  return row?.count ?? 0;
}
