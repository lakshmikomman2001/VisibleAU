import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, brandEntityScores } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { ExplainabilityService } from "@/lib/platform/explainability";

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
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id, name: brands.name })
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

    const [latest] = await tx
      .select()
      .from(brandEntityScores)
      .where(eq(brandEntityScores.brandId, brandId))
      .orderBy(desc(brandEntityScores.checkedAt))
      .limit(1);

    if (!latest) return NextResponse.json(null);

    const displayScore = latest.scoreOf10
      ? Math.round(Number(latest.scoreOf10) * 10)
      : 0;

    const annotation = ExplainabilityService.annotate({
      score: displayScore,
      scoreLabel: "Entity Authority",
      maxScore: 100,
      context: { brandName: brand.name, dimension: "entity authority" },
      topAction:
        !latest.knowledgePanelPresent
          ? "Establish a Knowledge Panel — critical for AI visibility."
          : !latest.wikidataEntryPresent
            ? "Create a Wikidata entry to strengthen entity recognition."
            : undefined,
    });

    const auDirectoryPresence = [
      latest.hipagesPresent && { name: "HiPages", rating: latest.hipagesRating },
      latest.yellowPagesPresent && { name: "Yellow Pages" },
      latest.serviceSeekingPresent && { name: "ServiceSeeking" },
      latest.wordOfMouthPresent && {
        name: "Word of Mouth",
        rating: latest.wordOfMouthRating,
      },
    ].filter(Boolean);

    const scoreLevel: "Low" | "Medium" | "High" =
      displayScore <= 33 ? "Low" : displayScore <= 66 ? "Medium" : "High";

    return NextResponse.json({
      ...latest,
      auDirectoryPresence,
      ...annotation,
      scoreLevel,
    });
  });
}
