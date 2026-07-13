import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, conversationJourneys } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { JourneyPromptSequenceSchema } from "@/lib/conversational/types";
import { assertBrandAccess, assertTier, BrandAccessDeniedError, TierInsufficientError } from "@/lib/governance";
import { getPrebuiltJourneysForVertical } from "@/db/seed/prebuilt-journeys";

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

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, "agency");
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    if (e instanceof TierInsufficientError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id, vertical: brands.vertical })
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

    const journeys = await tx
      .select()
      .from(conversationJourneys)
      .where(
        and(
          eq(conversationJourneys.brandId, brandId),
          eq(conversationJourneys.isActive, true),
        ),
      )
      .orderBy(desc(conversationJourneys.createdAt));

    const templates = getPrebuiltJourneysForVertical(brand.vertical).map((t, i) => ({
      id: `template-${t.vertical}-${i}`,
      journeyName: t.journeyName,
      vertical: t.vertical,
      buyerStage: t.buyerStage,
      promptSequence: t.promptSequence,
      isTemplate: true,
    }));

    return NextResponse.json({ journeys, templates });
  });
}

const CreateJourneySchema = z.object({
  journeyName: z.string().min(1).max(200),
  vertical: z.enum(["tradies", "allied_health", "saas", "professional_services", "real_estate"]),
  buyerStage: z.enum(["awareness", "consideration", "decision"]),
  promptSequence: JourneyPromptSequenceSchema,
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
    await assertTier(currentUser.organizationId, "agency");
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    if (e instanceof TierInsufficientError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

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
    if (!brand)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const parsed = CreateJourneySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
    }

    const [journey] = await tx
      .insert(conversationJourneys)
      .values({
        brandId,
        organizationId: currentUser.organizationId,
        journeyName: parsed.data.journeyName,
        vertical: parsed.data.vertical,
        buyerStage: parsed.data.buyerStage,
        promptSequence: parsed.data.promptSequence,
      })
      .returning();

    return NextResponse.json(journey, { status: 201 });
  });
}
