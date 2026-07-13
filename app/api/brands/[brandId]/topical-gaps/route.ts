import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, topicalCoverageGaps } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, assertTier, BrandAccessDeniedError, TierInsufficientError } from "@/lib/governance";

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
    await assertTier(currentUser.organizationId, "growth");
  } catch (e) {
    if (e instanceof TierInsufficientError)
      return NextResponse.json({ error: "Growth plan required" }, { status: 403 });
    throw e;
  }

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select()
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

    const gaps = await tx
      .select()
      .from(topicalCoverageGaps)
      .where(eq(topicalCoverageGaps.brandId, brandId))
      .orderBy(sql`${topicalCoverageGaps.crossPromptImpact} DESC NULLS LAST`);

    return NextResponse.json({
      gaps: gaps.map((g) => ({
        id: g.id,
        topicCluster: g.topicCluster,
        topicLabel: g.topicLabel,
        vertical: g.vertical,
        brandHasContent: g.brandHasContent,
        brandContentDepth: g.brandContentDepth,
        brandPassageCount: g.brandPassageCount,
        competitorCoverage: g.competitorCoverage,
        estimatedCitationImpact: g.estimatedCitationImpact,
        crossPromptImpact: g.crossPromptImpact,
        priorityRank: g.priorityRank,
      })),
    });
  });
}
