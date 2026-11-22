import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import { crawlSite } from "@/lib/crawler";
import { roleRefusal } from "@/lib/governance";

/**
 * POST /api/crawl -- crawls any domain a signed-in member with run_audit gives it. S00B part 3: crawlSite fetches
 * through the guarded fetcher (lib/fetch/guarded-fetch.ts), so an internal domain, or a site that redirects to an
 * internal address, is refused and answered as "0 pages" with the crawl's own error. Its auth is unchanged; it
 * can't be called anonymously, so no rate limiter was added (docs/lld/fetch-inventory.md, section 3).
 */
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
