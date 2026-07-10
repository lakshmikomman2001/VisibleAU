import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, conversationJourneys, subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { inngest } from "@/lib/inngest/client";
import { assertBrandAccess, BrandAccessDeniedError, recordAction } from "@/lib/governance";

const AGENCY_PLUS = ["agency", "agency_pro", "enterprise"];

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ brandId: string; journeyId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, journeyId } = await params;
  if (!z.string().uuid().safeParse(brandId).success || !z.string().uuid().safeParse(journeyId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [sub] = await tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1);

    const tier = sub?.tier ?? "free";
    if (!AGENCY_PLUS.includes(tier)) {
      return NextResponse.json(
        { error: "Journey Intelligence requires Agency tier or above" },
        { status: 403 },
      );
    }

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
    if (!brand)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [journey] = await tx
      .select({ id: conversationJourneys.id })
      .from(conversationJourneys)
      .where(
        and(
          eq(conversationJourneys.id, journeyId),
          eq(conversationJourneys.brandId, brandId),
        ),
      );
    if (!journey)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

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
