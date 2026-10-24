import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { actionItems, audits, citations } from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { recomputeCitationPositions } from "@/lib/audit/recompute-citation-positions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import {
  assertBrandAccess,
  assertTier,
  BrandAccessDeniedError,
  TierInsufficientError,
} from "@/lib/governance";
import { displayImpact, displayRecommendationTitle } from "@/lib/recommendations/confidence-labels";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";

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

    //
    // Vunnara (19 Oct, post-aa83b3a): scoreComposite now carries the
    // headline -- the Frequency DimensionResult (mention rate), never a
    // blend. When there were zero organic answers (insufficient_data
    // "no_answers") scoreComposite and its CI are null (both consumers --
    // pdf-builder and autopilot -- already type it `string | null`),
    // never a fabricated "0.00".
    const resolvedCurrent = await resolveAuditDimensionsAndHeadline(tx, rawAudit.id);
    const headline = resolvedCurrent.headline.status === "scored" ? resolvedCurrent.headline : null;
    const audit = {
      ...rawAudit,
      scoreComposite: headline ? headline.value.toFixed(2) : null,
      scoreFrequency:
        resolvedCurrent.dimensions.frequency.status === "scored"
          ? resolvedCurrent.dimensions.frequency.value.toFixed(2)
          : "0.00",
      scorePosition:
        resolvedCurrent.dimensions.position.status === "scored"
          ? resolvedCurrent.dimensions.position.value.toFixed(2)
          : "0.00",
      scoreAccuracy:
        resolvedCurrent.dimensions.accuracy.status === "scored"
          ? resolvedCurrent.dimensions.accuracy.value.toFixed(2)
          : "0.00",
      scoreConfidenceLow: headline ? headline.ci.lower.toFixed(2) : null,
      scoreConfidenceHigh: headline ? headline.ci.upper.toFixed(2) : null,
    };
    const priorHeadline = rawPriorAudit
      ? (await resolveAuditDimensionsAndHeadline(tx, rawPriorAudit.id)).headline
      : null;
    const priorAudit = rawPriorAudit
      ? {
          scoreComposite:
            priorHeadline?.status === "scored" ? priorHeadline.value.toFixed(2) : null,
          completedAt: rawPriorAudit.completedAt,
        }
      : null;

    const [items, engineCitationRows] = await Promise.all([
      tx
        .select({
          title: actionItems.title,
          action: actionItems.action,
          dimension: actionItems.dimension,
          confidenceLabel: actionItems.confidenceLabel,
          expectedImpactScore: actionItems.expectedImpactScore,
          confidenceBasis: actionItems.confidenceBasis,
          recommendationKey: actionItems.recommendationKey,
        })
        .from(actionItems)
        .where(and(eq(actionItems.auditId, audit.id), eq(actionItems.status, "open")))
        // Build 1 addendum, item 1: the agency PDF-builder preview must
        // show the same "Check: " framing for a legacy row as every
        // other surface -- transformed here, at the source.
        .then((rows) =>
          rows.map(({ recommendationKey, ...r }) => ({
            ...r,
            title: displayRecommendationTitle({ ...r, recommendationKey }),
            expectedImpactScore: displayImpact({ ...r, recommendationKey }),
          })),
        ),
      // Vunnara (21 Oct, hotfix: "Usually #16") -- used to aggregate
      // avgPosition via SQL AVG() straight over the stale, character-
      // offset-heuristic `position` column, feeding this straight into
      // the PDF-builder preview/autopilot-loop consumer. Fetches this
      // one audit's own organic rows (bounded, not N+1) and recomputes
      // each row's real rank from its own text before grouping below.
      tx
        .select({
          engine: citations.engine,
          brandMentioned: citations.brandMentioned,
          responseText: citations.responseText,
          responseSnippet: citations.responseSnippet,
        })
        .from(citations)
        .where(and(eq(citations.auditId, audit.id), ORGANIC_ONLY)),
    ]);

    const recomputedRows = await recomputeCitationPositions(engineCitationRows, {
      name: brand.name,
      domain: brand.domain,
    });
    const engineStats = Object.values(
      recomputedRows.reduce<
        Record<string, { engine: string; total: number; mentioned: number; positions: number[] }>
      >((acc, row) => {
        if (!acc[row.engine]) {
          acc[row.engine] = { engine: row.engine, total: 0, mentioned: 0, positions: [] };
        }
        const bucket = acc[row.engine];
        bucket.total++;
        if (row.brandMentioned) bucket.mentioned++;
        if (row.realPosition != null) bucket.positions.push(row.realPosition);
        return acc;
      }, {}),
    ).map(({ engine, total, mentioned, positions }) => ({
      engine,
      total,
      mentioned,
      avgPosition:
        positions.length > 0
          ? (
              Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
            ).toFixed(1)
          : null,
    }));

    return NextResponse.json({ audit, actionItems: items, priorAudit, engineStats });
  });
}
