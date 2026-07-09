import { serviceDb } from "@/db/client";
import { crawlerVisitLogs } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { parseVisitEvent } from "@/lib/retrieval/crawler-log-parser";

export const crawlerLogIngestFn = inngest.createFunction(
  {
    id: "crawler-log-ingest",
    retries: 2,
    triggers: [{ event: "visit/ingested" }],
  },
  async ({ event, step }: {
    event: {
      data: {
        brandId: string;
        organizationId: string;
        url: string;
        userAgent: string;
        referrer?: string;
        timestamp?: string;
      };
    };
    step: any;
  }) => {
    const { brandId, organizationId } = event.data;

    const row = await step.run("parse-and-insert", async () => {
      const parsed = parseVisitEvent({
        url: event.data.url,
        userAgent: event.data.userAgent,
        referrer: event.data.referrer,
        timestamp: event.data.timestamp,
      });

      await serviceDb.insert(crawlerVisitLogs).values({
        brandId,
        organizationId,
        crawlerName: parsed.crawlerName,
        crawlerTier: parsed.crawlerTier,
        visitedUrl: parsed.visitedUrl,
        statusCode: parsed.statusCode,
        responseTimeMs: parsed.responseTimeMs,
        errorType: parsed.errorType,
        rawLogLine: parsed.rawLogLine,
        isActiveAgent: parsed.isActiveAgent,
        referrerAiSession: parsed.referrerAiSession,
        visitPurpose: parsed.visitPurpose,
        visitedAt: parsed.visitedAt,
      });

      return { crawlerName: parsed.crawlerName, visitPurpose: parsed.visitPurpose };
    });

    return { ingested: true, ...row };
  },
);
