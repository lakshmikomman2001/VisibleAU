import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, visibilityTrends } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, brandAccessErrorResponse } from "@/lib/governance";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import {
  latestCompleteAudit,
  shareOfVoiceForAudit,
  sovPayload,
} from "@/lib/visibility/share-of-voice";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    const res = brandAccessErrorResponse(e);
    if (res) return res;
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
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const tier = await effectiveTier(tx, currentUser.organizationId);

    const [latestTrend] = await tx
      .select()
      .from(visibilityTrends)
      .where(eq(visibilityTrends.brandId, brandId))
      .orderBy(desc(visibilityTrends.calculatedAt))
      .limit(1);

    // One Share of Voice (7 Nov): the brand's latest complete audit, counted by the one counter the
    // Overview, audit page, PDF and wins feed read -- never the retired share_of_voice_snapshots rows
    // (the brand against every cited site), and never a share computed in the browser.
    const shareOfVoice = await shareOfVoiceForAudit(
      tx,
      {
        id: brand.id,
        name: brand.name,
        competitors: brand.competitors,
        competitorWebsites: brand.competitorWebsites,
      },
      await latestCompleteAudit(tx, brandId),
    );

    return NextResponse.json({
      trends: latestTrend
        ? {
            mentionRate: Number(latestTrend.mentionRate),
            citationRate: Number(latestTrend.citationRate),
            mentionSourceRatio: latestTrend.mentionSourceRatio
              ? Number(latestTrend.mentionSourceRatio)
              : null,
            brandArchetype: latestTrend.brandArchetype,
            marketCompetitionLabel: latestTrend.marketCompetitionLabel,
            citationVolatilityScore: latestTrend.citationVolatilityScore
              ? Number(latestTrend.citationVolatilityScore)
              : null,
            scoreCompositeAvg: latestTrend.scoreCompositeAvg
              ? Number(latestTrend.scoreCompositeAvg)
              : null,
            sampleQuality: latestTrend.sampleQuality,
            periodLabel: latestTrend.periodLabel,
            periodType: latestTrend.periodType,
          }
        : null,
      shareOfVoice: sovPayload(shareOfVoice, currentUser.organizationId),
      tier,
      brandDomain: brand.domain ?? "",
    });
  });
}
