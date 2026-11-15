import { NextResponse } from "next/server";
import { z } from "zod/v4";
import {
  getIngestSources,
  getVerificationRates,
  getVolumeByPurpose,
  getVolumeByVendor,
} from "@/lib/agent-analytics";
import { getCurrentUser } from "@/lib/auth/current-user";
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
    await assertTier(currentUser.organizationId, brandFeaturePlan("agent_analytics"));
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

  const [volumeByVendor, volumeByPurpose, verificationRates, ingestSources] = await Promise.all([
    getVolumeByVendor(brandId, periodStart, periodEnd),
    getVolumeByPurpose(brandId, periodStart, periodEnd),
    getVerificationRates(brandId, periodStart, periodEnd),
    // 17 Nov, part 3: which sources have ever sent a visit, so the setup panel says "Connected" only then.
    getIngestSources(brandId),
  ]);

  return NextResponse.json({
    overview: {
      volumeByVendor,
      volumeByPurpose,
      verificationRates,
      ingestSources,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
  });
}
