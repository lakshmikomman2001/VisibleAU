import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, comparisonPromptResults, subscriptions, topicalCoverageGaps } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError, recordAction } from "@/lib/governance";

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
      .select({ id: brands.id, competitors: brands.competitors })
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
    const configuredCompetitors = brand.competitors ?? [];

    const [latestAudit] = await tx
      .select({ auditId: comparisonPromptResults.auditId })
      .from(comparisonPromptResults)
      .where(eq(comparisonPromptResults.brandId, brandId))
      .orderBy(desc(comparisonPromptResults.runAt))
      .limit(1);

    const allRows = latestAudit?.auditId
      ? await tx
          .select()
          .from(comparisonPromptResults)
          .where(
            and(
              eq(comparisonPromptResults.brandId, brandId),
              eq(comparisonPromptResults.auditId, latestAudit.auditId),
            ),
          )
          .orderBy(desc(comparisonPromptResults.runAt))
      : [];

    const byCompetitor: Record<string, Array<{
      engine: string;
      brandWon: boolean | null;
      brandMentioned: boolean;
      competitorMentioned: boolean;
      verdictSnippet: string | null;
      runAt: string | Date | null;
    }>> = {};

    for (const r of allRows) {
      if (!configuredCompetitors.includes(r.competitorDomain)) continue;
      (byCompetitor[r.competitorDomain] ??= []).push({
        engine: r.engine,
        brandWon: r.brandWon,
        brandMentioned: r.brandMentioned,
        competitorMentioned: r.competitorMentioned,
        verdictSnippet: r.verdictSnippet,
        runAt: r.runAt,
      });
    }

    const competitors = Object.entries(byCompetitor).map(([domain, verdicts]) => ({
      competitorDomain: domain,
      verdicts,
      wins: verdicts.filter((v) => v.brandWon === true).length,
      losses: verdicts.filter((v) => v.brandWon === false).length,
      inconclusive: verdicts.filter((v) => v.brandWon === null).length,
    }));

    const gapsOwned = await tx
      .select({ count: sql<number>`COUNT(*)` })
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

    recordAction({
      organizationId: currentUser.organizationId,
      userId: currentUser.id,
      action: "competitive_benchmark_viewed",
      resourceType: "competitive_benchmark",
      resourceId: brandId,
    });

    return NextResponse.json({
      competitors,
      summary: {
        totalWins: competitors.reduce((s, c) => s + c.wins, 0),
        totalLosses: competitors.reduce((s, c) => s + c.losses, 0),
        totalInconclusive: competitors.reduce((s, c) => s + c.inconclusive, 0),
        topicalGapsOwned: Number(gapsOwned[0]?.count ?? 0),
        fastestPath: topGap[0]?.topicLabel
          ? `Create content for "${topGap[0].topicLabel}"`
          : null,
      },
      tier,
    });
  });
}
