import { and, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import type { Brand, Organization } from "@/db/schema";
import { brands } from "@/db/schema";

export const TIER_BRAND_LIMITS: Record<string, number> = {
  free: 1,
  starter: 1,
  growth: 1,
  agency: 5,
  agency_pro: 25,
  enterprise: Infinity,
};

// Team RBAC (org_members) is Agency+ (LLD 4191/4211); lower tiers have the feature LOCKED (1 = owner only).
// TODO(seats): viewer-role invites currently COUNT toward the limit; revisit exempting 'viewer'.
export const TIER_SEAT_LIMITS: Record<string, number> = {
  free: 1,
  starter: 1,
  growth: 1,
  agency: 5,
  agency_pro: 15,
  enterprise: Infinity,
};

export const TIER_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  growth: 2,
  agency: 3,
  agency_pro: 4,
  enterprise: 5,
};

export function isTierAtLeast(currentTier: string, requiredTier: string): boolean {
  return (TIER_RANK[currentTier] ?? 0) >= (TIER_RANK[requiredTier] ?? 0);
}

export async function getBrandForOrg(brandId: string, orgId: string, dbClient: DbClient): Promise<Brand | null> {
  const [brand] = await dbClient
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.organizationId, orgId), isNull(brands.deletedAt)));
  return brand ?? null;
}

export function inheritRegion(org: Organization): Organization["region"] {
  return org.region;
}

export function checkBrandLimit(org: Organization, currentBrandCount: number): boolean {
  const limit = TIER_BRAND_LIMITS[org.tier] ?? 1;
  return currentBrandCount < limit;
}
