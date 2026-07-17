import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, assertTier, BrandAccessDeniedError, TierInsufficientError } from "@/lib/governance";
import {
  getVolumeByVendor,
  getVolumeByPurpose,
  getVerificationRates,
} from "@/lib/agent-analytics";

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
    await assertTier(currentUser.organizationId, "starter");
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

  const [volumeByVendor, volumeByPurpose, verificationRates] = await Promise.all([
    getVolumeByVendor(brandId, periodStart, periodEnd),
    getVolumeByPurpose(brandId, periodStart, periodEnd),
    getVerificationRates(brandId, periodStart, periodEnd),
  ]);

  return NextResponse.json({
    overview: {
      volumeByVendor,
      volumeByPurpose,
      verificationRates,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
  });
}
