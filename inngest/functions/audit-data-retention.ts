import { lt } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits } from "@/db/schema/audits";
import { citations } from "@/db/schema/citations";
import { crawlerVisitLogs } from "@/db/schema/crawler-visit-logs";
import { organizations } from "@/db/schema/organizations";
import { inngest } from "@/lib/inngest/client";
import { recordDataResidency } from "@/lib/governance";

export const auditDataRetention = inngest.createFunction(
  {
    id: "audit-data-retention",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 4 * * 0" }],
  },
  async ({ step }) => {
    const cutoff12m = new Date();
    cutoff12m.setMonth(cutoff12m.getMonth() - 12);

    const result = await step.run("delete-old-audit-data", async () => {
      const deletedCitations = await serviceDb
        .delete(citations)
        .where(lt(citations.createdAt, cutoff12m))
        .returning({ id: citations.id });

      const deletedAudits = await serviceDb
        .delete(audits)
        .where(lt(audits.createdAt, cutoff12m))
        .returning({ id: audits.id });

      return {
        deletedCitations: deletedCitations.length,
        deletedAudits: deletedAudits.length,
      };
    });

    const crawlerPurge = await step.run("purge-crawler-visit-logs", async () => {
      const cutoff90d = new Date();
      cutoff90d.setDate(cutoff90d.getDate() - 90);

      const deleted = await serviceDb
        .delete(crawlerVisitLogs)
        .where(lt(crawlerVisitLogs.visitedAt, cutoff90d))
        .returning({ id: crawlerVisitLogs.id });

      return { deletedCrawlerVisitLogs: deleted.length };
    });

    const residencyRefresh = await step.run("refresh-data-residency", async () => {
      const orgs = await serviceDb.select({ id: organizations.id }).from(organizations);
      let refreshed = 0;
      for (const org of orgs) {
        await recordDataResidency(org.id);
        refreshed++;
      }
      return { orgsRefreshed: refreshed };
    });

    return { ...result, ...crawlerPurge, ...residencyRefresh };
  },
);
