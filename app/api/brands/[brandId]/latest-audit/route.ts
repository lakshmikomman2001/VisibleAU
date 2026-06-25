import { and, count, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, setRlsContext } from "@/db/client";
import { actionItems, audits, citations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = currentUser.organization.id;
  await setRlsContext(db, orgId);
  const { brandId } = await params;

  const completedAudits = await db
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
    db
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
    db
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
}
