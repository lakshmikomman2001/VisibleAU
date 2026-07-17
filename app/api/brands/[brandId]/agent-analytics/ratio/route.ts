import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, assertTier, BrandAccessDeniedError, TierInsufficientError } from "@/lib/governance";
import { getCrawlToReferralRatio } from "@/lib/agent-analytics";

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

  const ratios = await getCrawlToReferralRatio(brandId, periodStart, periodEnd);

  return NextResponse.json({
    ratio: {
      results: ratios,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      caveat: "Referral attribution is structurally incomplete — many AI platforms send no referrer header, mobile AI apps strip it, and Google AI Mode uses noreferrer. The referral side is a lower bound; the true ratio is better than shown.",
    },
  });
}
