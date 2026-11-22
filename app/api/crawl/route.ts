import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import { crawlSite } from "@/lib/crawler";
import { roleRefusal } from "@/lib/governance";
import { checkPostgresRateLimit } from "@/lib/governance/pg-rate-limit";

/**
 * POST /api/crawl -- crawls any domain a signed-in member with run_audit gives it. S00B part 3: crawlSite fetches
 * through the guarded fetcher (lib/fetch/guarded-fetch.ts), so an internal domain, or a site that redirects to an
 * internal address, is refused and answered as "0 pages" with the crawl's own error. Its auth is unchanged.
 *
 * S01 part 0 (LLD section 0.2 #19): at most CRAWL_LIMIT crawls a user an hour, on the Postgres rate limiter keyed by
 * user, as GET /api/brands/name-suggestion is. A request that is refused before crawling (signed out, no run_audit,
 * a bad body) isn't counted. Over the limit: 429 "Too many requests" (the app's rate-limit answer) with Retry-After.
 * Nothing in the app calls this route (S01 report, Part 0); LLD 0.3 leaves its removal to Sri.
 */
const CRAWL_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 } as const;

const crawlSchema = z.object({
  domain: z.string().min(3),
  maxPages: z.number().int().min(1).max(20).optional(),
});

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const forbidden = await roleRefusal(currentUser, "run_audit");
  if (forbidden) return forbidden;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = crawlSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { domain, maxPages } = parsed.data;

  const limit = await checkPostgresRateLimit({
    routeKey: "crawl",
    ip: `user:${currentUser.id}`,
    ...CRAWL_LIMIT,
  });
  if (!limit.allowed) {
    console.warn(
      JSON.stringify({ event: "crawl_rate_limited", userId: currentUser.id, max: CRAWL_LIMIT.max }),
    );
    const retryAfter = Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  try {
    const result = await crawlSite(domain, { maxPages: maxPages ?? 20 });
    return NextResponse.json({
      domain: result.domain,
      pagesCount: result.pages.length,
      robotsTxtPresent: !!result.robotsTxt,
      sitemapPresent: !!result.sitemapXml,
      crawledAt: result.crawledAt,
      errors: result.errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Crawl failed" },
      { status: 500 },
    );
  }
}
