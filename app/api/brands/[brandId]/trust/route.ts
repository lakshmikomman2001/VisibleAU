import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { ExplainabilityService } from "@/lib/platform/explainability";
import { computeTrustSummary } from "@/lib/trust";

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
        { error: "Trust Intelligence requires Growth tier or above" },
        { status: 403 },
      );
    }

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

    const summary = await computeTrustSummary(tx, brandId);

    const annotation = ExplainabilityService.annotate({
      score: summary.overallTrustScore,
      scoreLabel: "Trust Score",
      maxScore: 100,
      context: { brandName: brand.name, dimension: "trust" },
      topAction:
        summary.hallucinationRisk > 50
          ? "Review hallucination incidents — high risk detected."
          : summary.entityScore < 30
            ? "Run an entity score refresh to establish authority signals."
            : undefined,
    });

    const risk = summary.hallucinationRisk;
    const riskLevel: "Low" | "Medium" | "High" =
      risk <= 33 ? "Low" : risk <= 66 ? "Medium" : "High";
    const riskRationale =
      risk === 0
        ? `No open hallucination incidents detected for ${brand.name}. Risk is minimal — the brand has a clean record across AI responses.`
        : risk <= 33
          ? `${brand.name} has a low hallucination risk of ${risk}/100. A small number of inaccuracies were detected — monitor and address if they persist.`
          : risk <= 66
            ? `${brand.name}'s hallucination risk of ${risk}/100 indicates moderate exposure. Review flagged incidents and consider corrective action.`
            : `${brand.name}'s hallucination risk of ${risk}/100 is elevated. Multiple inaccuracies detected in AI responses — immediate review recommended.`;

    return NextResponse.json({
      ...summary,
      ...annotation,
      riskLevel,
      riskRationale,
    });
  });
}
