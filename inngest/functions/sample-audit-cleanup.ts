import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, brands, organizations } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";

export const sampleAuditCleanup = inngest.createFunction(
  { id: "sample-audit-cleanup", triggers: [{ cron: "0 3 * * *" }] },
  async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [sampleOrg] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "__sample__"));

    if (!sampleOrg) return { deleted: 0 };

    const oldAudits = await db
      .select({ id: audits.id, brandId: audits.brandId })
      .from(audits)
      .where(
        and(
          eq(audits.organizationId, sampleOrg.id),
          lt(audits.createdAt, cutoff),
        ),
      );

    if (oldAudits.length === 0) return { deleted: 0 };

    const auditIds = oldAudits.map((a) => a.id);
    const brandIds = [...new Set(oldAudits.map((a) => a.brandId))];

    await db
      .delete(audits)
      .where(
        and(
          eq(audits.organizationId, sampleOrg.id),
          lt(audits.createdAt, cutoff),
        ),
      );

    for (const brandId of brandIds) {
      const [remaining] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(audits)
        .where(eq(audits.brandId, brandId));

      if (remaining && Number(remaining.c) === 0) {
        await db.delete(brands).where(eq(brands.id, brandId));
      }
    }

    return { deleted: auditIds.length };
  },
);
