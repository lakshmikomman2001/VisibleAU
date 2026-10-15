import { and, eq, lt, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, organizations, rateLimitCounters } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";

export const sampleAuditCleanup = inngest.createFunction(
  { id: "sample-audit-cleanup", triggers: [{ cron: "0 3 * * *" }] },
  async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Task #46 (17th follow-up): rate_limit_counters has no native TTL --
    // a daily delete here is cheap for a table this small/low-write, and
    // this cron already runs once a day for the sample-audit domain this
    // counter is scoped to. A 2-day cutoff (vs the 24h window itself)
    // leaves a day of slack so a counter row is never deleted mid-window.
    const rateLimitCutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const deletedCounters = await serviceDb
      .delete(rateLimitCounters)
      .where(lt(rateLimitCounters.windowStart, rateLimitCutoff))
      .returning({ id: rateLimitCounters.id });

    const [sampleOrg] = await serviceDb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "__sample__"));

    if (!sampleOrg) return { deleted: 0, deletedRateLimitCounters: deletedCounters.length };

    const oldAudits = await serviceDb
      .select({ id: audits.id, brandId: audits.brandId })
      .from(audits)
      .where(and(eq(audits.organizationId, sampleOrg.id), lt(audits.createdAt, cutoff)));

    if (oldAudits.length === 0) {
      return { deleted: 0, deletedRateLimitCounters: deletedCounters.length };
    }

    const auditIds = oldAudits.map((a) => a.id);
    const brandIds = [...new Set(oldAudits.map((a) => a.brandId))];

    await serviceDb
      .delete(audits)
      .where(and(eq(audits.organizationId, sampleOrg.id), lt(audits.createdAt, cutoff)));

    for (const brandId of brandIds) {
      const [remaining] = await serviceDb
        .select({ c: sql<number>`count(*)::int` })
        .from(audits)
        .where(eq(audits.brandId, brandId));

      if (remaining && Number(remaining.c) === 0) {
        await serviceDb.delete(brands).where(eq(brands.id, brandId));
      }
    }

    return { deleted: auditIds.length, deletedRateLimitCounters: deletedCounters.length };
  },
);
