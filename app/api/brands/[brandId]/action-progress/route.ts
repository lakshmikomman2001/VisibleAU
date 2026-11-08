import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isTierAtLeast } from "@/lib/brands";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { planRefusalBody } from "@/lib/pricing/plan-refusal";
import { getProgressSummary } from "@/lib/workflow/progress-summary";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tier = await withRlsContext(currentUser.organizationId, (tx) =>
    effectiveTier(tx, currentUser.organizationId),
  );
  const plan = brandFeaturePlan("action_progress");
  if (!isTierAtLeast(tier, plan)) return NextResponse.json(planRefusalBody(plan), { status: 403 });

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  const summary = await withRlsContext(currentUser.organizationId, (tx) =>
    getProgressSummary(brandId, tx),
  );

  return NextResponse.json({
    completedThisMonth: summary.completedThisMonth,
    totalTasks: summary.totalTasks,
    measuredImpact: summary.measuredImpact,
    validationPending: summary.validationPending,
  });
}
