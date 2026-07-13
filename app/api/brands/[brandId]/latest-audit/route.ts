import { and, count, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { actionItems, audits, citations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { assertBrandAccess, assertTier, BrandAccessDeniedError, TierInsufficientError } from "@/lib/governance";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
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
      .where(
        and(
          eq(audits.brandId, brandId),
          eq(audits.status, "complete"),
        ),
      )
      .orderBy(desc(audits.completedAt))
      .limit(2);

    if (completedAudits.length === 0) {
      return NextResponse.json({ audit: null, actionItems: [], priorAudit: null, engineStats: [] });
    }

    const audit = completedAudits[0];
    const priorAudit = completedAudits.length > 1
      ? { scoreComposite: completedAudits[1].scoreComposite, completedAt: completedAudits[1].completedAt }
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
        .where(
          and(
            eq(actionItems.auditId, audit.id),
            eq(actionItems.status, "open"),
          ),
        ),
      tx
        .select({
          engine: citations.engine,
          total: count(),
          mentioned: sql<string>`SUM(CASE WHEN brand_mentioned THEN 1 ELSE 0 END)`,
          avgPosition: sql<string>`ROUND(AVG(CASE WHEN brand_mentioned AND position IS NOT NULL THEN position END)::numeric, 1)`,
        })
        .from(citations)
        .where(eq(citations.auditId, audit.id))
        .groupBy(citations.engine),
    ]);

    return NextResponse.json({ audit, actionItems: items, priorAudit, engineStats });
  });
}
