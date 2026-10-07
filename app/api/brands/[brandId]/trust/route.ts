import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  assertBrandAccess,
  assertTier,
  BrandAccessDeniedError,
  TierInsufficientError,
} from "@/lib/governance";
import { ExplainabilityService } from "@/lib/platform/explainability";
import { computeTrustSummary } from "@/lib/trust";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, "growth");
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    if (e instanceof TierInsufficientError)
      return NextResponse.json({ error: e.message }, { status: 403 });
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
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const summary = await computeTrustSummary(tx, brandId);

    // Trust Intelligence honesty pass: overallTrustScore is null when
    // every component (hallucination coverage, entity, LinkedIn,
    // consensus, YouTube) is absent/excluded -- there is no score to
    // annotate, only an honest "insufficient data" state. See
    // docs/ops/post-launch-db-hardening.md section 34.
    const annotation =
      summary.overallTrustScore === null
        ? {
            rationale: `Insufficient data to score ${brand.name} yet — no measured trust signals (hallucination coverage, entity authority, LinkedIn, consensus, or YouTube) are available.`,
            confidence_label: null,
            confidence_note: null,
            top_action: null,
          }
        : ExplainabilityService.annotate({
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
    const citationCount = summary.citationCount;

    // Trust Intelligence honesty pass: "0 open incidents" only earns a
    // "clean record / Low / 0 = safe" framing when there was at least 1
    // AI citation to check in the first place -- otherwise "0 of 0
    // checked" is indistinguishable from a genuinely clean record.
    // Threshold: citationCount > 0 (any coverage at all). The no-coverage
    // message reuses ExplainabilityService.annotate()'s own "no data"
    // wording rather than hand-rolling a new string.
    const riskLevel: "Low" | "Medium" | "High" | null =
      citationCount === 0 ? null : risk <= 33 ? "Low" : risk <= 66 ? "Medium" : "High";
    const riskRationale =
      citationCount === 0
        ? ExplainabilityService.annotate({
            score: 0,
            scoreLabel: "Hallucination Risk",
            maxScore: 100,
            context: { brandName: brand.name, dimension: "hallucination risk", sampleSize: 0 },
          }).rationale
        : risk === 0
          ? `No open hallucination incidents detected across ${citationCount} AI response${citationCount === 1 ? "" : "s"} for ${brand.name}. Risk is minimal — the brand has a clean record across AI responses.`
          : risk <= 33
            ? `${brand.name} has a low hallucination risk of ${risk}/100 across ${citationCount} AI responses. A small number of inaccuracies were detected — monitor and address if they persist.`
            : risk <= 66
              ? `${brand.name}'s hallucination risk of ${risk}/100 across ${citationCount} AI responses indicates moderate exposure. Review flagged incidents and consider corrective action.`
              : `${brand.name}'s hallucination risk of ${risk}/100 across ${citationCount} AI responses is elevated. Multiple inaccuracies detected in AI responses — immediate review recommended.`;

    return NextResponse.json({
      ...summary,
      ...annotation,
      riskLevel,
      riskRationale,
    });
  });
}
