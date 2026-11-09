import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, conversationJourneys } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  assertBrandAccess,
  assertTier,
  brandAccessErrorResponse,
  recordAction,
  roleRefusal,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { inngest } from "@/lib/inngest/client";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ brandId: string; journeyId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, journeyId } = await params;
  if (
    !z.string().uuid().safeParse(brandId).success ||
    !z.string().uuid().safeParse(journeyId).success
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, brandFeaturePlan("journeys"));
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    if (e instanceof TierInsufficientError) return tierRefusal(e);
    throw e;
  }
  const forbidden = await roleRefusal(currentUser, "run_audit");
  if (forbidden) return forbidden;

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [journey] = await tx
      .select({ id: conversationJourneys.id })
      .from(conversationJourneys)
      .where(
        and(eq(conversationJourneys.id, journeyId), eq(conversationJourneys.brandId, brandId)),
      );
    if (!journey) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await inngest.send({
      name: "journey/run-requested",
      data: {
        journeyId,
        brandId,
        organizationId: currentUser.organizationId,
      },
    });

    await recordAction({
      organizationId: currentUser.organizationId,
      userId: currentUser.id,
      action: "journey_triggered",
      resourceType: "journey",
      resourceId: journeyId,
      metadata: { brandId },
    });

    return NextResponse.json({ queued: true, journeyId }, { status: 202 });
  });
}
