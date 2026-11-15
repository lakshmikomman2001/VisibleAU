import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits, brands, comparisonPromptResults } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rejudgeStoredComparison } from "@/lib/conversational/comparison-verdict";
import { assertBrandAccess, brandAccessErrorResponse, recordAction } from "@/lib/governance";
import { effectiveTier } from "@/lib/pricing/effective-tier";

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
      .select({
        id: brands.id,
        name: brands.name,
        domain: brands.domain,
        competitors: brands.competitors,
      })
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

    const byCompetitor: Record<
      string,
      Array<{
        engine: string;
        brandWon: boolean | null;
        brandMentioned: boolean;
        competitorMentioned: boolean;
        verdictSnippet: string | null;
        runAt: string | Date | null;
      }>
    > = {};

    for (const r of allRows) {
      if (!configuredCompetitors.includes(r.competitorDomain)) continue;
      // 17 Nov, part 3: judged again from the stored answer, as the comparisons page does
      // (lib/conversational/comparison-verdict.ts) -- the stored brand_won counted a website-only match as a win.
      const judged = rejudgeStoredComparison(r, {
        brandName: brand.name,
        brandDomain: brand.domain,
        competitorDomain: r.competitorDomain,
      });
      (byCompetitor[r.competitorDomain] ??= []).push({
        engine: r.engine,
        brandWon: judged.brandWon,
        brandMentioned: judged.brandMentioned,
        competitorMentioned: judged.competitorMentioned,
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

    // 17 Nov, part 3: which audit's head-to-head questions these are (the page said nothing).
    const [comparisonAudit] = latestAudit?.auditId
      ? await tx
          .select({ number: audits.auditNumber, completedAt: audits.completedAt })
          .from(audits)
          .where(eq(audits.id, latestAudit.auditId))
      : [];

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
        // 17 Nov, part 3: no "Topics they own" / "Fastest path" -- both came from topical_coverage_gaps, which isn't a
        // measurement (and "they own" counted topics with no competitor in them).
      },
      audit: comparisonAudit
        ? {
            number: comparisonAudit.number,
            completedAt: comparisonAudit.completedAt?.toISOString() ?? null,
          }
        : null,
      tier,
    });
  });
}
