import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isTierAtLeast } from "@/lib/brands";
import { assertBrandAccess, brandAccessErrorResponse } from "@/lib/governance";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { planRefusalBody } from "@/lib/pricing/plan-refusal";
import { questionTrend } from "@/lib/visibility/question-trend";

const uuidSchema = z.string().uuid();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string; promptId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, promptId } = await params;
  if (!uuidSchema.safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tier = await withRlsContext(currentUser.organizationId, (tx) =>
    effectiveTier(tx, currentUser.organizationId),
  );
  const plan = brandFeaturePlan("prompt_trends");
  if (!isTierAtLeast(tier, plan)) return NextResponse.json(planRefusalBody(plan), { status: 403 });

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    throw e;
  }

  // 17 Nov, part 3: audit by audit, as the audit page counts answers (lib/visibility/question-trend.ts) -- it grouped
  // every row by calendar week, counting unverified mentions and every run.
  return withRlsContext(currentUser.organizationId, async (tx) => {
    const trend = await questionTrend(tx, brandId, decodeURIComponent(promptId));
    if (trend.length < 2)
      return NextResponse.json({ trend: [], message: "Not enough comparable audits" });
    return NextResponse.json({ trend });
  });
}
