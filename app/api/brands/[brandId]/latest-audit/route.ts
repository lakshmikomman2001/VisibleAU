import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { actionItems, audits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { getCitedDirectoryNames } from "@/lib/directories/citation-counts";
import {
  assertBrandAccess,
  assertTier,
  BrandAccessDeniedError,
  TierInsufficientError,
} from "@/lib/governance";
import {
  displayImpact,
  displayRecommendationAction,
  displayRecommendationTitle,
} from "@/lib/recommendations/confidence-labels";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";
import { visibilityDisplay } from "@/lib/scoring/visibility-display";

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
        scoreSentimentNumeric: audits.scoreSentimentNumeric,
        scoreContextNumeric: audits.scoreContextNumeric,
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
      // Audit #36: no 0-100 Position/Source-citation scores any more --
      // the counts the preview shows them as ("#4", "3 of 3"), through
      // lib/scoring/measured-display.ts like every other surface.
      mentionedCount: resolvedCurrent.mentionedCount,
      sampleCount: resolvedCurrent.sampleCount,
      // How every surface shows it: "8%" over "3 of 40" (lib/scoring/visibility-display.ts).
      visibility: visibilityDisplay(resolvedCurrent),
      rankedCount: resolvedCurrent.rankedCount,
      medianPosition: resolvedCurrent.medianPosition,
      sourcedCount: resolvedCurrent.sourcedCount,
      scoreConfidenceLow: headline ? headline.ci.lower.toFixed(2) : null,
      scoreConfidenceHigh: headline ? headline.ci.upper.toFixed(2) : null,
    };
    const resolvedPrior = rawPriorAudit
      ? await resolveAuditDimensionsAndHeadline(tx, rawPriorAudit.id)
      : null;
    const priorHeadline = resolvedPrior?.headline ?? null;
    const priorAudit = rawPriorAudit
      ? {
          scoreComposite:
            priorHeadline?.status === "scored" ? priorHeadline.value.toFixed(2) : null,
          visibility: visibilityDisplay(resolvedPrior),
          completedAt: rawPriorAudit.completedAt,
        }
      : null;

    const items = await tx
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
      .then(async (rows) => {
        const citedDirectories = rows.some((r) => r.recommendationKey === "entity-profiles")
          ? await getCitedDirectoryNames(tx, audit.id, brand)
          : [];
        return rows.map(({ recommendationKey, ...r }) => ({
          ...r,
          title: displayRecommendationTitle({ ...r, recommendationKey }),
          action: displayRecommendationAction({ ...r, recommendationKey }, citedDirectories),
          expectedImpactScore: displayImpact({ ...r, recommendationKey }),
        }));
      });

    // Audit #36: the same per-engine split the headline sums (successful
    // everyday answers, run 1, verified mentions) -- it used to count
    // organic rows across every run, unverified matches included, with
    // a mean rank per engine.
    const engineStats = resolvedCurrent.perEngine;

    return NextResponse.json({ audit, actionItems: items, priorAudit, engineStats });
  });
}
