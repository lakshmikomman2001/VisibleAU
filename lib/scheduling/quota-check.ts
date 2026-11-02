import { and, eq, gte, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { TIER_AUDIT_LIMITS } from "./tier-limits";

export async function checkQuota(organizationId: string, _brandId: string): Promise<boolean> {
  // No subscription, or one that has ended: no scheduled or automated audits.
  const tier = await effectiveTier(serviceDb, organizationId);
  if (tier === "free") return false;

  const limits = TIER_AUDIT_LIMITS[tier as keyof typeof TIER_AUDIT_LIMITS];
  if (!limits) return true;

  const limit =
    "auditsPerBrandPerMonth" in limits
      ? limits.auditsPerBrandPerMonth * limits.brandsMax
      : "auditsPerMonth" in limits
        ? limits.auditsPerMonth
        : Infinity;

  if (limit === Infinity) return true;

  const [{ count }] = await serviceDb
    .select({ count: sql<number>`count(*)::int` })
    .from(audits)
    .innerJoin(brands, eq(audits.brandId, brands.id))
    .where(
      and(
        eq(brands.organizationId, organizationId),
        gte(
          audits.createdAt,
          sql`date_trunc('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
        ),
      ),
    );

  return count < limit;
}
