import { isNull, lt } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { aiReferralHits } from "@/db/schema/ai-referral-hits";
import { crawlerVisitLogs } from "@/db/schema/crawler-visit-logs";
import { organizations } from "@/db/schema/organizations";
import { recordDataResidency } from "@/lib/governance";
import {
  AI_REFERRAL_HIT_RETENTION_DAYS,
  AUDIT_DATA_RETENTION_MONTHS,
  CRAWLER_LOG_RETENTION_DAYS,
} from "@/lib/governance/residency-config";
import { inngest } from "@/lib/inngest/client";
import { deleteExpiredAnswerCache } from "@/lib/retention/answer-cache-retention";
import { deleteExpiredAudits } from "@/lib/retention/audit-retention";

export const auditDataRetention = inngest.createFunction(
  {
    id: "audit-data-retention",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 4 * * 0" }],
  },
  async ({ step }) => {
    // Mock-gate and retention follow-ups (Sri, 2 Nov), part 3: an audit is deleted with its children, in bounded
    // batches, one transaction each (lib/retention/audit-retention.ts). This used to delete citations, then
    // audits, outside a transaction: from about June 2027 the audit delete would have hit the foreign keys from
    // action_items, drift_alerts, engine_call_failures and audit_exports, after the citations were already gone.
    // An error throws, so the step and the run fail where it shows: never "Completed" while skipping.
    const result = await step.run("delete-old-audit-data", async () => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - AUDIT_DATA_RETENTION_MONTHS);
      const deleted = await deleteExpiredAudits(serviceDb, cutoff);
      console.log(JSON.stringify({ event: "audit_data_retention", ...deleted }));
      return deleted;
    });

    const crawlerPurge = await step.run("purge-crawler-visit-logs", async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - CRAWLER_LOG_RETENTION_DAYS);

      const deleted = await serviceDb
        .delete(crawlerVisitLogs)
        .where(lt(crawlerVisitLogs.visitedAt, cutoff))
        .returning({ id: crawlerVisitLogs.id });

      return { deletedCrawlerVisitLogs: deleted.length };
    });

    const referralPurge = await step.run("purge-ai-referral-hits", async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - AI_REFERRAL_HIT_RETENTION_DAYS);

      const deleted = await serviceDb
        .delete(aiReferralHits)
        .where(lt(aiReferralHits.createdAt, cutoff))
        .returning({ id: aiReferralHits.id });

      return { deletedAiReferralHits: deleted.length };
    });

    const residencyRefresh = await step.run("refresh-data-residency", async () => {
      // Open workspaces only: a closed one counts as absent.
      const orgs = await serviceDb
        .select({ id: organizations.id })
        .from(organizations)
        .where(isNull(organizations.deletedAt));
      let refreshed = 0;
      for (const org of orgs) {
        await recordDataResidency(org.id);
        refreshed++;
      }
      return { orgsRefreshed: refreshed };
    });

    // Retention follow-ups, part 2: the answer cache was never purged. An expired row is never served again
    // (lib/llm/cache.ts), so it's deleted here; it's reused for at most ANSWER_CACHE_REUSE_HOURS. Last, so a
    // run in flight when this deploys meets it only after every step it already knows.
    const cachePurge = await step.run("purge-expired-answer-cache", async () => {
      const purged = await deleteExpiredAnswerCache(serviceDb, new Date());
      console.log(JSON.stringify({ event: "answer_cache_purge", ...purged }));
      return { deletedCacheRows: purged.deletedCacheRows, moreCacheRows: purged.more };
    });

    return { ...result, ...crawlerPurge, ...referralPurge, ...residencyRefresh, ...cachePurge };
  },
);
