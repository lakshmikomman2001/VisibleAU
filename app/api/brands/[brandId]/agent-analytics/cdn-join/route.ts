import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, assertTier, BrandAccessDeniedError, TierInsufficientError } from "@/lib/governance";
import { computeCdnShieldJoin } from "@/lib/agent-analytics";
import { CdnShieldDetector } from "@/lib/crawler/cdn-shield-detector";

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

  // Get shield diagnoses from the CDN Shield detector for known vendors
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

  // Probe with known AI bot UAs to determine blocking status
  const vendorUAs: Array<{ vendor: string; ua: string }> = [
    { vendor: "openai", ua: "GPTBot/1.0" },
    { vendor: "anthropic", ua: "ClaudeBot/1.0" },
    { vendor: "google", ua: "Googlebot/2.1" },
    { vendor: "perplexity", ua: "PerplexityBot/1.0" },
  ];

  const shieldDiagnoses = await Promise.all(
    vendorUAs.map(async ({ vendor, ua }) => {
      try {
        const res = await fetch(`https://${brand.domain}/`, {
          method: "HEAD",
          headers: { "User-Agent": ua },
          signal: AbortSignal.timeout(5000),
          redirect: "follow",
        });
        const diagnostic = CdnShieldDetector.analyzeHeaders(
          res.status,
          Object.fromEntries(res.headers.entries()),
        );
        return { vendor, isBlocked: diagnostic.isBlockedByCDN };
      } catch {
        return { vendor, isBlocked: false };
      }
    }),
  );

  const joinResults = await computeCdnShieldJoin(brandId, shieldDiagnoses, periodStart, periodEnd);

  return NextResponse.json({
    cdnJoin: {
      results: joinResults,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      domain: brand.domain,
    },
  });
}
