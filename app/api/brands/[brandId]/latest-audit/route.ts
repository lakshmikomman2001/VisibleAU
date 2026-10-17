import { and, count, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { actionItems, audits, citations } from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import {
  assertBrandAccess,
  assertTier,
  BrandAccessDeniedError,
  TierInsufficientError,
} from "@/lib/governance";
import { resolveAuditDimensionsAndComposite } from "@/lib/scoring/resolve-audit-dimensions";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = currentUser.organization.id;
  const { brandId } = await params;

  try {
    await assertTier(orgId, "growth");
  } catch (e) {
    if (e instanceof TierInsufficientError)
      return NextResponse.json({ error: "Growth plan required" }, { status: 403 });
    throw e;
  }

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    throw e;
  }

  return withRlsContext(orgId, async (tx) => {
    const brand = await getBrandForOrg(brandId, orgId, tx);
    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const completedAudits = await tx
      .select({
        id: audits.id,
        auditNumber: audits.auditNumber,
        scoreComposite: audits.scoreComposite,
        scoreFrequency: audits.scoreFrequency,
        scorePosition: audits.scorePosition,
        scoreSentimentNumeric: audits.scoreSentimentNumeric,
        scoreContextNumeric: audits.scoreContextNumeric,
        scoreAccuracy: audits.scoreAccuracy,
        scoreConfidenceLow: audits.scoreConfidenceLow,
        scoreConfidenceHigh: audits.scoreConfidenceHigh,
        completedAt: audits.completedAt,
        engines: audits.engines,
        promptsCount: audits.promptsCount,
      })
      .from(audits)
      .where(and(eq(audits.brandId, brandId), eq(audits.status, "complete")))
      .orderBy(desc(audits.completedAt))
      .limit(2);

    if (completedAudits.length === 0) {
      return NextResponse.json({ audit: null, actionItems: [], priorAudit: null, engineStats: [] });
    }

    // Task #46 (fix: stored value contradicting its own CI): the
    // response below used to hand pdf-builder/autopilot-loop the raw
    // stored audits.score_* columns directly -- stale the moment a
    // prod-fix changes which citations rows count as organic without
    // the audit being re-run (see lib/scoring/resolve-audit-
    // dimensions.ts's own doc comment). This route only ever touches
    // 1-2 audits (the latest and its immediate prior), so a live
    // recompute of each is cheap -- overwriting the same response field
    // names means every downstream consumer needs no changes at all.
    const rawAudit = completedAudits[0];
    const rawPriorAudit = completedAudits.length > 1 ? completedAudits[1] : null;

    const resolvedCurrent = await resolveAuditDimensionsAndComposite(tx, rawAudit.id);
    const audit = {
      ...rawAudit,
      scoreComposite: resolvedCurrent.composite.value.toFixed(2),
      scoreFrequency: resolvedCurrent.dimensions.frequency.status === "scored"
        ? resolvedCurrent.dimensions.frequency.value.toFixed(2)
        : "0.00",
      scorePosition: resolvedCurrent.dimensions.position.status === "scored"
        ? resolvedCurrent.dimensions.position.value.toFixed(2)
        : "0.00",
      scoreAccuracy: resolvedCurrent.dimensions.accuracy.status === "scored"
        ? resolvedCurrent.dimensions.accuracy.value.toFixed(2)
        : "0.00",
      scoreConfidenceLow: resolvedCurrent.composite.ci.lower.toFixed(2),
      scoreConfidenceHigh: resolvedCurrent.composite.ci.upper.toFixed(2),
    };
    const priorAudit = rawPriorAudit
      ? {
          scoreComposite: (
            await resolveAuditDimensionsAndComposite(tx, rawPriorAudit.id)
          ).composite.value.toFixed(2),
          completedAt: rawPriorAudit.completedAt,
        }
      : null;

    const [items, engineStats] = await Promise.all([
      tx
        .select({
          title: actionItems.title,
          action: actionItems.action,
          dimension: actionItems.dimension,
          confidenceLabel: actionItems.confidenceLabel,
          expectedImpactScore: actionItems.expectedImpactScore,
        })
        .from(actionItems)
        .where(and(eq(actionItems.auditId, audit.id), eq(actionItems.status, "open"))),
      tx
        .select({
          engine: citations.engine,
          total: count(),
          mentioned: sql<string>`SUM(CASE WHEN brand_mentioned THEN 1 ELSE 0 END)`,
          avgPosition: sql<string>`ROUND(AVG(CASE WHEN brand_mentioned AND position IS NOT NULL THEN position END)::numeric, 1)`,
        })
        .from(citations)
        .where(and(eq(citations.auditId, audit.id), ORGANIC_ONLY))
        .groupBy(citations.engine),
    ]);

    return NextResponse.json({ audit, actionItems: items, priorAudit, engineStats });
  });
}
