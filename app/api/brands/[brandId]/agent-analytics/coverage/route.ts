import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, assertTier, BrandAccessDeniedError, TierInsufficientError } from "@/lib/governance";
import { getCoverageGap, getTopPagesByPurpose } from "@/lib/agent-analytics";
import { crawlSite } from "@/lib/crawler";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, "growth");
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (e instanceof TierInsufficientError)
      return NextResponse.json({ error: "Upgrade required" }, { status: 403 });
    throw e;
  }

  const url = new URL(req.url);
  const days = Math.min(parseInt(url.searchParams.get("days") ?? "30", 10) || 30, 90);
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - days * 24 * 60 * 60 * 1000);

  const { serviceDb } = await import("@/db/client");
  const { brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const [brand] = await serviceDb
    .select({ domain: brands.domain })
    .from(brands)
    .where(eq(brands.id, brandId));

  if (!brand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get sitemap URLs via the canonical crawler
  let sitemapUrls: string[] = [];
  try {
    const crawlResult = await crawlSite(brand.domain, { maxPages: 0 });
    if (crawlResult.sitemapXml) {
      const urlMatches = crawlResult.sitemapXml.match(/<loc>([^<]+)<\/loc>/g);
      if (urlMatches) {
        sitemapUrls = urlMatches.map((m) => m.replace(/<\/?loc>/g, ""));
      }
    }
  } catch {
    // If sitemap fetch fails, report empty coverage
  }

  const [coverageGap, topRetrieval, topIndexing] = await Promise.all([
    getCoverageGap(brandId, sitemapUrls, periodStart, periodEnd),
    getTopPagesByPurpose(brandId, "retrieval", periodStart, periodEnd, 10),
    getTopPagesByPurpose(brandId, "indexing", periodStart, periodEnd, 10),
  ]);

  return NextResponse.json({
    coverage: {
      gap: coverageGap,
      topRetrieval,
      topIndexing,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
  });
}
