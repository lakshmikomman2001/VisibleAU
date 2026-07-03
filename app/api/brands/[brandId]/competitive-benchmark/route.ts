import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, shareOfVoiceSnapshots, subscriptions, topicalCoverageGaps } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const competitor = searchParams.get("competitor");
  if (!competitor)
    return NextResponse.json(
      { error: "competitor query param required" },
      { status: 400 },
    );

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

    const [sub] = await tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1);

    const tier = sub?.tier ?? "starter";

    const sovRows = await tx
      .select()
      .from(shareOfVoiceSnapshots)
      .where(
        and(
          eq(shareOfVoiceSnapshots.brandId, brandId),
          eq(shareOfVoiceSnapshots.competitorDomain, competitor),
        ),
      )
      .orderBy(desc(shareOfVoiceSnapshots.calculatedAt))
      .limit(5);

    const brandShare =
      sovRows.length > 0
        ? Number(sovRows[0].brandShare ?? 0)
        : 0;
    const competitorShare =
      sovRows.length > 0
        ? Number(sovRows[0].competitorShare ?? 0)
        : 0;

    const gapsOwned = await tx
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(topicalCoverageGaps)
      .where(
        and(
          eq(topicalCoverageGaps.brandId, brandId),
          eq(topicalCoverageGaps.brandHasContent, false),
        ),
      );

    const topGap = await tx
      .select({ topicLabel: topicalCoverageGaps.topicLabel })
      .from(topicalCoverageGaps)
      .where(
        and(
          eq(topicalCoverageGaps.brandId, brandId),
          eq(topicalCoverageGaps.brandHasContent, false),
        ),
      )
      .orderBy(sql`${topicalCoverageGaps.crossPromptImpact} DESC NULLS LAST`)
      .limit(1);

    // CPR-01: comparison_prompt_results not available until Sprint 7
    const comparisonData = null;
    const competitorNarrative = null;
    const dataAvailableFrom = "Sprint 7";

    return NextResponse.json({
      shareOfVoice: {
        brandShare,
        competitorShare,
        competitorDomain: competitor,
      },
      topicalGaps: {
        topicalGapsOwned: Number(gapsOwned[0]?.count ?? 0),
        fastestPath: topGap[0]?.topicLabel
          ? `Create content for "${topGap[0].topicLabel}"`
          : null,
      },
      comparisonData,
      competitorNarrative,
      dataAvailableFrom,
      tier,
    });
  });
}
