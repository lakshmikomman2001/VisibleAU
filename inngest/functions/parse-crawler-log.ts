import { NonRetriableError } from "inngest";
import { serviceDb } from "@/db/client";
import { crawlerVisitLogs } from "@/db/schema/crawler-visit-logs";
import {
  CRAWLER_LOG_BUCKET,
  type CrawlerLogUploadedEvent,
  isCrawlerLogPathOf,
  type LegacyCrawlerLogUploadedEvent,
} from "@/lib/agent-analytics/log-upload-storage";
import { type ParsedCrawlerHit, parseCrawlerLog } from "@/lib/agent-analytics/parse-crawler-log";
import { inngest } from "@/lib/inngest/client";
import { getStorage } from "@/lib/storage";

type UploadEventData = CrawlerLogUploadedEvent | LegacyCrawlerLogUploadedEvent;

/** One step of a run, as Inngest gives it (only `run` is used). */
interface StepRunner {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>;
}

/**
 * 20 Nov (Sri's decision, part 5): the uploaded file is read from private storage, never from the event
 * (lib/agent-analytics/log-upload-storage.ts). Only the AI crawlers' visits are kept (lib/agent-analytics/
 * parse-crawler-log.ts discards every other line); the raw file is deleted as soon as it's parsed, and -- through
 * onFailure -- when parsing fails for the last time. A path outside the event's own workspace and brand folder is
 * refused before anything is read or deleted.
 *
 * Step ids are those the function had ("parse-and-filter", "insert-hits", "emit-ingested") plus "delete-raw-file", so
 * a run in flight across the deploy finds its steps. An upload sent by the old route (the file in the event) is still
 * parsed, and there is no stored file to delete.
 */
export async function handleCrawlerLogUpload({
  event,
  step,
}: {
  event: { data: UploadEventData };
  step: StepRunner;
}) {
  const data = event.data;
  const { brandId, organizationId, domain, filename } = data;
  const storagePath = "storagePath" in data ? data.storagePath : null;
  if (storagePath !== null && !isCrawlerLogPathOf(storagePath, organizationId, brandId)) {
    throw new NonRetriableError("crawler log path isn't in this workspace's folder");
  }

  const result = await step.run("parse-and-filter", async () => {
    if (storagePath === null) {
      const legacy = data as LegacyCrawlerLogUploadedEvent;
      return parseCrawlerLog(Buffer.from(legacy.contentBase64, "base64"), filename);
    }
    const buffer = await getStorage(CRAWLER_LOG_BUCKET).download(storagePath);
    if (!buffer) throw new NonRetriableError("the uploaded log file is no longer in storage");
    return parseCrawlerLog(buffer, filename);
  });

  // The file isn't needed once it's parsed (the step's result is kept by Inngest for a retry of what follows).
  if (storagePath !== null) {
    await step.run("delete-raw-file", async () => {
      await getStorage(CRAWLER_LOG_BUCKET).delete([storagePath]);
      return { deleted: storagePath };
    });
  }

  if (result.hits.length === 0) {
    return {
      status: "empty",
      totalLines: result.totalLines,
      discardedHuman: result.discardedHuman,
      discardedStatic: result.discardedStatic,
      discardedInvalidIp: result.discardedInvalidIp,
    };
  }

  const hits: ParsedCrawlerHit[] = result.hits.map((hit) => ({
    ...hit,
    // A step's result comes back as JSON: the visit's time is a string again.
    timestamp: new Date(hit.timestamp),
  }));

  const insertedCount = await step.run("insert-hits", async () => {
    let count = 0;
    for (const hit of hits) {
      try {
        await serviceDb
          .insert(crawlerVisitLogs)
          .values({
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
          })
          .onConflictDoNothing(); // AA-02: relies on crawler_logs_dedup_idx (expression index with COALESCE)
        count++;
      } catch (err) {
        // Task #46 (10th follow-up): source_ip is validated before this point
        // (lib/agent-analytics/parse-crawler-log.ts), so this should now only
        // ever be an unrelated DB error -- log it (never hit.sourceIp, which
        // can be a real visitor IP) instead of skipping silently.
        console.debug(
          `parse-crawler-log insert-hits: skipped one row (${err instanceof Error ? err.message : "unknown error"})`,
        );
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
    discardedInvalidIp: result.discardedInvalidIp,
  };
}

/**
 * When a run fails for the last time, its file is deleted: nothing will read it again. Only a path in the event's own
 * workspace and brand folder, as above.
 */
export async function deleteCrawlerLogAfterFailure({
  event,
}: {
  event: { data: { event: { data: UploadEventData } } };
}) {
  const data = event.data.event.data;
  if (!("storagePath" in data)) return { deleted: null };
  if (!isCrawlerLogPathOf(data.storagePath, data.organizationId, data.brandId)) {
    return { deleted: null };
  }
  await getStorage(CRAWLER_LOG_BUCKET).delete([data.storagePath]);
  return { deleted: data.storagePath };
}

export const parseCrawlerLogFn = inngest.createFunction(
  {
    id: "parse-crawler-log",
    concurrency: { limit: 3 },
    triggers: [{ event: "crawler-log/uploaded" }],
    onFailure: ({ event }) =>
      deleteCrawlerLogAfterFailure({
        event: event as unknown as { data: { event: { data: UploadEventData } } },
      }),
  },
  ({ event, step }) =>
    handleCrawlerLogUpload({
      event: event as unknown as { data: UploadEventData },
      step: step as unknown as StepRunner,
    }),
);
