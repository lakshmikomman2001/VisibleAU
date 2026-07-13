import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, assertTier, BrandAccessDeniedError, TierInsufficientError } from "@/lib/governance";
import { inngest } from "@/lib/inngest/client";
import { formatPeriodLabel } from "@/lib/visibility/visibility-trend-aggregator";

const generateSchema = z.object({
  periodLabel: z.string().optional(),
  periodType: z.enum(["weekly", "monthly"]).default("weekly"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, "growth");
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    if (e instanceof TierInsufficientError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const periodType = parsed.data.periodType;
  const periodLabel =
    parsed.data.periodLabel ?? formatPeriodLabel(new Date(), periodType);

  await inngest.send({
    name: "trend/aggregated",
    data: {
      brandId,
      organizationId: currentUser.organizationId,
      periodLabel,
      periodType,
      manual: true,
    },
  });

  return NextResponse.json({ message: "Report generation started", periodLabel }, { status: 202 });
}
