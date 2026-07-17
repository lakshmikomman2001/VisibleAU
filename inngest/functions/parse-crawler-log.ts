import { eq, and, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { crawlerVisitLogs } from "@/db/schema/crawler-visit-logs";
import { parseCrawlerLog } from "@/lib/agent-analytics/parse-crawler-log";
import { inngest } from "@/lib/inngest/client";

export const parseCrawlerLogFn = inngest.createFunction(
  {
    id: "parse-crawler-log",
    concurrency: { limit: 3 },
    triggers: [{ event: "crawler-log/uploaded" }],
  },
  async ({ event, step }: { event: { data: { brandId: string; organizationId: string; domain: string; filename: string; contentBase64: string } }; step: any }) => {
    const { brandId, organizationId, domain, filename, contentBase64 } = event.data;

    const result = await step.run("parse-and-filter", async () => {
      const buffer = Buffer.from(contentBase64, "base64");
      return parseCrawlerLog(buffer, filename);
    });

    if (result.hits.length === 0) {
      return {
        status: "empty",
        totalLines: result.totalLines,
        discardedHuman: result.discardedHuman,
        discardedStatic: result.discardedStatic,
      };
    }

    const insertedCount = await step.run("insert-hits", async () => {
      let count = 0;
      for (const hit of result.hits) {
        try {
          await serviceDb.insert(crawlerVisitLogs).values({
            brandId,
            organizationId,
            crawlerName: hit.registryMatch.uaToken,
            crawlerTier: hit.registryMatch.crawlerTier,
            visitedUrl: `https://${domain}${hit.path}`,
            statusCode: hit.statusCode,
            rawLogLine: null,
            isActiveAgent: hit.registryMatch.isAgentUa,
            referrerAiSession: hit.registryMatch.aiPlatform,
            visitPurpose: hit.registryMatch.defaultPurpose,
            visitedAt: hit.timestamp,
            sourceIp: hit.sourceIp,
            bytes: hit.bytes || null,
            ingestSource: "log_upload",
          }).onConflictDoNothing(); // AA-02: relies on crawler_logs_dedup_idx (expression index with COALESCE)
          count++;
        } catch {
          // skip
        }
      }
      return count;
    });

    await step.run("emit-ingested", async () => {
      await inngest.send({
        name: "crawler-hits/ingested",
        data: {
          brandId,
          organizationId,
          hitCount: insertedCount,
          source: "log_upload",
        },
      });
    });

    return {
      status: "processed",
      totalLines: result.totalLines,
      hitsIngested: insertedCount,
      discardedHuman: result.discardedHuman,
      discardedStatic: result.discardedStatic,
    };
  },
);
