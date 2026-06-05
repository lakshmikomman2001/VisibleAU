import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
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

export async function getBrandForOrg(brandId: string, orgId: string): Promise<Brand | null> {
  const [brand] = await db
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
