import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits, brands, shareOfVoiceSnapshots, subscriptions, visibilityTrends } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const [sub] = await tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1);

    const [latestTrend] = await tx
      .select()
      .from(visibilityTrends)
      .where(eq(visibilityTrends.brandId, brandId))
      .orderBy(desc(visibilityTrends.calculatedAt))
      .limit(1);

    // Scope Share of Voice to ONE coherent snapshot -- the brand's most
    // recently completed audit -- never a grab-bag of the last N rows across
    // whatever mix of audits and engines happened to be calculated most
    // recently. All engines/categories from that single audit are returned;
    // combining them into a displayed number is the frontend aggregator's
    // job (it sums raw counts, never Math.max, never a different audit).
    const [latestAudit] = await tx
      .select({ id: audits.id })
      .from(audits)
      .where(and(eq(audits.brandId, brandId), eq(audits.status, "complete")))
      .orderBy(desc(audits.completedAt))
      .limit(1);

    const sovRows = latestAudit
      ? await tx
          .select()
          .from(shareOfVoiceSnapshots)
          .where(eq(shareOfVoiceSnapshots.auditId, latestAudit.id))
      : [];

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
      sov: sovRows.map((r) => ({
        competitorDomain: r.competitorDomain,
        brandShare: Number(r.brandShare),
        competitorShare: Number(r.competitorShare),
        engine: r.engine,
        promptCategory: r.promptCategory,
        auditId: r.auditId,
        brandMentionCount: r.brandMentionCount,
        competitorMentionCount: r.competitorMentionCount,
        totalMentionCount: r.totalMentionCount,
        calculatedAt: r.calculatedAt.toISOString(),
      })),
      tier: sub?.tier ?? "starter",
      brandDomain: brand.domain ?? "",
    });
  });
}
