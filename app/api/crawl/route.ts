import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import { crawlSite } from "@/lib/crawler";

const crawlSchema = z.object({
  domain: z.string().min(3),
  maxPages: z.number().int().min(1).max(20).optional(),
});

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
