import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, brandConsensusChecks } from "@/db/schema";
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

    const checks = await tx
      .select()
      .from(brandConsensusChecks)
      .where(eq(brandConsensusChecks.brandId, brandId))
      .orderBy(desc(brandConsensusChecks.checkedAt));

    const scores = checks
      .map((c) => c.consistencyScore)
      .filter((s): s is number => s !== null);
    const avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

    const annotation = ExplainabilityService.annotate({
      score: avgScore,
      scoreLabel: "Consensus Score",
      maxScore: 100,
      context: {
        brandName: brand.name,
        dimension: "cross-platform consensus",
        sampleSize: checks.length,
      },
      topAction:
        avgScore < 70
          ? "Fix discrepancies across platforms to improve consistency."
          : undefined,
    });

    const scoreLevel: "Low" | "Medium" | "High" =
      avgScore <= 33 ? "Low" : avgScore <= 66 ? "Medium" : "High";

    return NextResponse.json({ checks, avgScore, ...annotation, scoreLevel });
  });
}
