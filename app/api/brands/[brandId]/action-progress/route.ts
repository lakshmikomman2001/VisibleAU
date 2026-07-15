import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { isTierAtLeast } from "@/lib/brands";
import { getProgressSummary } from "@/lib/workflow/progress-summary";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [sub] = await withRlsContext(currentUser.organizationId, (tx) =>
    tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1),
  );
  const tier = sub?.tier ?? "free";
  if (!isTierAtLeast(tier, "growth"))
    return NextResponse.json({ error: "Growth plan required" }, { status: 403 });

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
