import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, assertTier, BrandAccessDeniedError, TierInsufficientError } from "@/lib/governance";
import { ingestReferrals, convertUtmToReferrals } from "@/lib/agent-analytics";
import type { ReferralRecord } from "@/lib/agent-analytics";

const referralSchema = z.object({
  records: z.array(
    z.object({
      referrerDomain: z.string(),
      landingPath: z.string(),
      sessionCount: z.number().int().min(1),
      periodStart: z.string(),
      periodEnd: z.string(),
      source: z.enum(["ga4", "log_referrer", "utm"]),
    }),
  ),
});

const utmSchema = z.object({
  utmRecords: z.array(
    z.object({
      landingPath: z.string(),
      utmSource: z.string(),
      utmMedium: z.string().optional(),
      sessionCount: z.number().int().min(1),
      periodStart: z.string(),
      periodEnd: z.string(),
    }),
  ),
});

export async function POST(
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

  const body = await req.json();

  // Support both direct referral records and UTM-based records
  let records: ReferralRecord[] = [];

  const directParse = referralSchema.safeParse(body);
  if (directParse.success) {
    records = directParse.data.records;
  } else {
    const utmParse = utmSchema.safeParse(body);
    if (utmParse.success) {
      records = convertUtmToReferrals(utmParse.data.utmRecords);
    } else {
      return NextResponse.json(
        { error: "Invalid request body — provide records or utmRecords" },
        { status: 422 },
      );
    }
  }

  const result = await ingestReferrals(
    currentUser.organizationId,
    brandId,
    records,
  );

  return NextResponse.json({ referrals: result });
}
