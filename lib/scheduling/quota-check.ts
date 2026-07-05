import { and, eq, gte, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { TIER_AUDIT_LIMITS } from "./tier-limits";

export async function checkQuota(organizationId: string, _brandId: string): Promise<boolean> {
  const [sub] = await serviceDb
    .select({ tier: subscriptions.tier })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId));
  if (!sub) return false;

  const limits = TIER_AUDIT_LIMITS[sub.tier as keyof typeof TIER_AUDIT_LIMITS];
  if (!limits) return true;

  const limit = "auditsPerBrandPerMonth" in limits
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
        gte(audits.createdAt, sql`date_trunc('month', NOW())`)
      )
    );

  return count < limit;
}
