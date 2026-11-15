import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, comparisonPromptResults } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isTierAtLeast } from "@/lib/brands";
import { rejudgeStoredComparison } from "@/lib/conversational/comparison-verdict";
import { assertBrandAccess, brandAccessErrorResponse } from "@/lib/governance";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { planRefusalBody } from "@/lib/pricing/plan-refusal";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const tier = await effectiveTier(tx, currentUser.organizationId);
    const plan = brandFeaturePlan("competitor_comparisons");
    if (!isTierAtLeast(tier, plan)) {
      return NextResponse.json(planRefusalBody(plan), { status: 403 });
    }

    const [brand] = await tx
      .select({ id: brands.id, name: brands.name, domain: brands.domain })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const results = await tx
      .select()
      .from(comparisonPromptResults)
      .where(eq(comparisonPromptResults.brandId, brandId))
      .orderBy(
        comparisonPromptResults.competitorDomain,
        comparisonPromptResults.engine,
        desc(comparisonPromptResults.runAt),
      );

    const latestByCompetitorEngine = new Map<string, (typeof results)[number]>();
    for (const r of results) {
      const key = `${r.competitorDomain}::${r.engine}`;
      if (!latestByCompetitorEngine.has(key)) {
        latestByCompetitorEngine.set(key, r);
      }
    }

    // 17 Nov, part 3: every row is judged again from its stored answer (rejudgeStoredComparison). The old rule
    // counted a brand the answer named only by its website as a win by default, and took whoever was named
    // first as the winner; rows it wrote still carry that verdict. An answer kept only in part (rows from
    // before 17 Nov kept its first 300 characters) can't be judged again and is inconclusive, saying why.
    // brandMentioned is a text match in this separate head-to-head answer, not the audit's verified mention:
    // the page labels it "Named in this answer".
    return NextResponse.json(
      Array.from(latestByCompetitorEngine.values()).map((r) => {
        const judged = rejudgeStoredComparison(r, {
          brandName: brand.name,
          brandDomain: brand.domain,
          competitorDomain: r.competitorDomain,
        });
        return {
          id: r.id,
          auditId: r.auditId,
          competitorDomain: r.competitorDomain,
          engine: r.engine,
          brandWon: judged.brandWon,
          brandMentioned: judged.brandMentioned,
          competitorMentioned: judged.competitorMentioned,
          answerCutOff: judged.answerCutOff,
          runAt: r.runAt,
        };
      }),
    );
  });
}
