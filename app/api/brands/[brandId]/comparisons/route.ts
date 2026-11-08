import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, comparisonPromptResults } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isTierAtLeast } from "@/lib/brands";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
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
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const tier = await effectiveTier(tx, currentUser.organizationId);
    const plan = brandFeaturePlan("competitor_comparisons");
    if (!isTierAtLeast(tier, plan)) {
      return NextResponse.json(planRefusalBody(plan), { status: 403 });
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

    return NextResponse.json(Array.from(latestByCompetitorEngine.values()));
  });
}
