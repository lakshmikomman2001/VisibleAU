import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, brands, organizations } from "@/db/schema";
import { TIER_AUDIT_LIMITS } from "./tier-limits";

export async function checkQuota(organizationId: string, _brandId: string): Promise<boolean> {
  const [org] = await db
    .select({ tier: organizations.tier })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  if (!org) return false;

  const limits = TIER_AUDIT_LIMITS[org.tier as keyof typeof TIER_AUDIT_LIMITS];
  if (!limits) return true;

  const limit = "auditsPerBrandPerMonth" in limits
    ? limits.auditsPerBrandPerMonth * limits.brandsMax
    : "auditsPerMonth" in limits
    ? limits.auditsPerMonth
    : Infinity;

  if (limit === Infinity) return true;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(audits)
    .innerJoin(brands, eq(audits.brandId, brands.id))
    .where(
      and(
        eq(brands.organizationId, organizationId),
        gte(audits.createdAt, sql`date_trunc('month', NOW())`)
      )
    );

  return count < limit;
}
