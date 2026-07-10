import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, comparisonPromptResults, subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";

const GROWTH_PLUS = ["growth", "agency", "agency_pro", "enterprise"];

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
    const [sub] = await tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1);

    const tier = sub?.tier ?? "free";
    if (!GROWTH_PLUS.includes(tier)) {
      return NextResponse.json(
        { error: "Comparison Intelligence requires Growth tier or above" },
        { status: 403 },
      );
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
    if (!brand)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const results = await tx
      .select()
      .from(comparisonPromptResults)
      .where(eq(comparisonPromptResults.brandId, brandId))
      .orderBy(
        comparisonPromptResults.competitorDomain,
        comparisonPromptResults.engine,
        desc(comparisonPromptResults.runAt),
      );

    const latestByCompetitorEngine = new Map<string, typeof results[number]>();
    for (const r of results) {
      const key = `${r.competitorDomain}::${r.engine}`;
      if (!latestByCompetitorEngine.has(key)) {
        latestByCompetitorEngine.set(key, r);
      }
    }

    return NextResponse.json(Array.from(latestByCompetitorEngine.values()));
  });
}
