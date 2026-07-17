import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { crawlerVisitLogs } from "@/db/schema/crawler-visit-logs";
import { lookupByUserAgent } from "@/lib/agent-analytics/bot-registry";
import { verifyCrawlerHit } from "@/lib/agent-analytics/verify-crawler-hits";
import { inngest } from "@/lib/inngest/client";

export const verifyCrawlerHitsFn = inngest.createFunction(
  {
    id: "verify-crawler-hits",
    concurrency: { limit: 2 },
    triggers: [{ event: "crawler-hits/ingested" }],
  },
  async ({ event, step }: { event: { data: { brandId: string; organizationId: string; hitCount: number; source: string } }; step: any }) => {
    const { brandId, organizationId } = event.data;

    const unverifiedHits = await step.run("fetch-unverified", async () => {
      return serviceDb
        .select({
          id: crawlerVisitLogs.id,
          sourceIp: crawlerVisitLogs.sourceIp,
          crawlerName: crawlerVisitLogs.crawlerName,
        })
        .from(crawlerVisitLogs)
        .where(
          and(
            eq(crawlerVisitLogs.brandId, brandId),
            isNull(crawlerVisitLogs.verificationStatus),
            sql`${crawlerVisitLogs.sourceIp} IS NOT NULL`,
          ),
        )
        .limit(5000);
    });

    if (unverifiedHits.length === 0) {
      return { status: "nothing_to_verify" };
    }

    const verifiedCount = await step.run("verify-hits", async () => {
      const ipVendorCache = new Map<string, { status: string; via: string | null }>();
      let count = 0;

      for (const hit of unverifiedHits) {
        if (!hit.sourceIp) continue;

        const registry = await lookupByUserAgent(hit.crawlerName);
        if (!registry) {
          await serviceDb
            .update(crawlerVisitLogs)
            .set({ verificationStatus: "unverified", verifiedVia: null })
            .where(eq(crawlerVisitLogs.id, hit.id));
          count++;
          continue;
        }

        const cacheKey = `${hit.sourceIp}:${registry.vendor}`;
        let result = ipVendorCache.get(cacheKey);

        if (!result) {
          const verification = await verifyCrawlerHit(hit.sourceIp, registry);
          result = { status: verification.status, via: verification.verifiedVia };
          ipVendorCache.set(cacheKey, result);
        }

        await serviceDb
          .update(crawlerVisitLogs)
          .set({
            verificationStatus: result.status,
            verifiedVia: result.via,
          })
          .where(eq(crawlerVisitLogs.id, hit.id));
        count++;
      }

      return count;
    });

    // Check for impersonation: unverified rate > 25% over recent hits for any vendor
    await step.run("check-impersonation", async () => {
      const stats = await serviceDb.execute(sql`
        SELECT crawler_name,
          COUNT(*) FILTER (WHERE verification_status = 'spoofed') as spoofed,
          COUNT(*) as total
        FROM crawler_visit_logs
        WHERE brand_id = ${brandId}
          AND visited_at > now() - interval '1 hour'
          AND verification_status IS NOT NULL
        GROUP BY crawler_name
        HAVING COUNT(*) >= 10
      `);

      const rows = (stats as unknown as Array<{ crawler_name: string; spoofed: string; total: string }>);

      for (const row of rows) {
        const spoofedRate = parseInt(row.spoofed) / parseInt(row.total);
        if (spoofedRate > 0.25) {
          await inngest.send({
            name: "crawler.impersonation-detected",
            data: {
              organizationId,
              brandId,
              crawlerName: row.crawler_name,
              spoofedCount: parseInt(row.spoofed),
              totalCount: parseInt(row.total),
              spoofedRate: Math.round(spoofedRate * 100),
            },
          });
        }
      }
    });

    return { status: "verified", count: verifiedCount };
  },
);
