import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { computeCdnShieldJoin } from "@/lib/agent-analytics";
import { getCurrentUser } from "@/lib/auth/current-user";
import { fetchRobotsTxt } from "@/lib/crawler";
import {
  assertBrandAccess,
  assertTier,
  brandAccessErrorResponse,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";

export async function GET(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
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
    await assertTier(currentUser.organizationId, brandFeaturePlan("cdn_shield_check"));
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    if (e instanceof TierInsufficientError) return tierRefusal(e);
    throw e;
  }

  const url = new URL(req.url);
  const days = Math.min(parseInt(url.searchParams.get("days") ?? "30", 10) || 30, 90);
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - days * 24 * 60 * 60 * 1000);

  const { serviceDb } = await import("@/db/client");
  const { sql } = await import("drizzle-orm");
  const { brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const [brand] = await serviceDb
    .select({ domain: brands.domain })
    .from(brands)
    .where(eq(brands.id, brandId));

  if (!brand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2: this sent a HEAD request as GPTBot, ClaudeBot, Googlebot and
  // PerplexityBot and called a 403 "blocked" -- pretending to be them. It reads robots.txt as us, and the
  // verdicts come from that and the brand's verified crawler visits (lib/agent-analytics/cdn-shield-join.ts).
  const robotsTxt = await fetchRobotsTxt(brand.domain);

  const joinResults = await computeCdnShieldJoin(brandId, robotsTxt, periodStart, periodEnd);

  return NextResponse.json({
    cdnJoin: {
      results: joinResults,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      domain: brand.domain,
    },
  });
}
