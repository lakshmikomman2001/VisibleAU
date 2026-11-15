import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isTierAtLeast } from "@/lib/brands";
import { assertBrandAccess, brandAccessErrorResponse } from "@/lib/governance";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { planRefusalBody } from "@/lib/pricing/plan-refusal";
import { latestEverydayQuestions } from "@/lib/visibility/question-trend";

const uuidSchema = z.string().uuid();

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
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

  // 17 Nov, part 3: the latest audit's everyday questions -- it listed every distinct question ever asked, branded
  // questions and old question sets included.
  return withRlsContext(currentUser.organizationId, async (tx) =>
    NextResponse.json({ prompts: await latestEverydayQuestions(tx, brandId) }),
  );
}
