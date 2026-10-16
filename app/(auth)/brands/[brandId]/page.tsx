import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, citations } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const {
    brand,
    isFree,
    tier,
    auditCount,
    recentAudits,
    latestAudit,
    avgPosition,
    totalMentions,
    sentimentScore,
    sentimentInsufficientData,
    engineStats,
  } = await withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select()
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      )
      .limit(1);

    if (!brand) notFound();

    const [sub] = await serviceDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1);
    const tier = sub?.tier ?? "free";
    const isFree = tier === "free";

    const [{ auditCount }] = await tx
      .select({ auditCount: count() })
      .from(audits)
      .where(and(eq(audits.brandId, brand.id), eq(audits.status, "complete")));

    const recentAudits = await tx
      .select({
        id: audits.id,
        scoreComposite: audits.scoreComposite,
        completedAt: audits.completedAt,
      })
      .from(audits)
      .where(and(eq(audits.brandId, brand.id), eq(audits.status, "complete")))
      .orderBy(desc(audits.completedAt))
      .limit(12);

    const latestAudit = recentAudits[0] ?? null;

    const latestCompleted = await tx
      .select({ id: audits.id, scoreSentimentNumeric: audits.scoreSentimentNumeric })
      .from(audits)
      .where(and(eq(audits.brandId, brand.id), eq(audits.status, "complete")))
      .orderBy(desc(audits.completedAt))
      .limit(1);

    const latestAuditId = latestCompleted[0]?.id ?? null;

    // Task #46 Phase 2: the TRUE independent-sample mention count per audit
    // (organic, run_number = 1 -- same basis as the audit detail page's own
    // gate, lib/scoring/dimension-result.ts), derived at READ time for every
    // audit this page needs to render a score for -- the sparkline's 12
    // points, the "Visibility score" KPI tile, and the "Sentiment" KPI tile
    // (which reads scoreSentimentNumeric off a possibly-different "latest"
    // row, latestAuditId, folded into the same IN-list rather than a
    // second query).
    const mentionCountAuditIds = Array.from(
      new Set([...recentAudits.map((a) => a.id), ...(latestAuditId ? [latestAuditId] : [])]),
    );
    const mentionCountRows =
      mentionCountAuditIds.length > 0
        ? await tx
            .select({
              auditId: citations.auditId,
              mentionCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
            })
            .from(citations)
            .where(and(inArray(citations.auditId, mentionCountAuditIds), ORGANIC_ONLY, eq(citations.runNumber, 1)))
            .groupBy(citations.auditId)
        : [];
    // Postgres SUM() surfaces as a string via the JS driver -- coerce once
    // here so every downstream `=== 0` / truthiness check means what it says
    // (see lib/scoring/dimension-result.ts's own comment on this).
    const mentionCountByAuditId = new Map(
      mentionCountRows.map((r) => [r.auditId, Number(r.mentionCount)]),
    );
    const isInsufficientData = (auditId: string) => (mentionCountByAuditId.get(auditId) ?? 0) === 0;

    const recentAuditsWithStatus = recentAudits.map((a) => ({
      scoreComposite: a.scoreComposite,
      completedAt: a.completedAt,
      insufficientData: isInsufficientData(a.id),
    }));
    const latestAuditWithStatus = latestAudit
      ? { scoreComposite: latestAudit.scoreComposite, insufficientData: isInsufficientData(latestAudit.id) }
      : null;
    const sentimentInsufficientData = latestAuditId ? isInsufficientData(latestAuditId) : false;

    let avgPosition: number | null = null;
    let totalMentions = 0;
    let sentimentScore: number | null = null;
    let engineStats: Array<{ engine: string; total: number; mentions: number }> = [];

    if (latestAuditId) {
      const posRow = await tx
        .select({
          avgPos: sql<number>`round(avg(${citations.position})::numeric, 1)`,
        })
        .from(citations)
        .where(
          and(
            eq(citations.auditId, latestAuditId),
            eq(citations.brandMentioned, true),
            sql`${citations.position} IS NOT NULL`,
            ORGANIC_ONLY,
          ),
        );
      avgPosition = posRow[0]?.avgPos ?? null;

      const mentionRows = await tx
        .select({ cnt: count() })
        .from(citations)
        .innerJoin(audits, eq(citations.auditId, audits.id))
        .where(
          and(
            eq(audits.brandId, brand.id),
            eq(audits.status, "complete"),
            eq(citations.brandMentioned, true),
            ORGANIC_ONLY,
          ),
        );
      totalMentions = Number(mentionRows[0]?.cnt ?? 0);

      sentimentScore = latestCompleted[0]?.scoreSentimentNumeric
        ? Number.parseFloat(latestCompleted[0].scoreSentimentNumeric)
        : null;

      engineStats = await tx
        .select({
          engine: citations.engine,
          total: count(),
          mentions: sql<number>`sum(case when ${citations.brandMentioned} then 1 else 0 end)`,
        })
        .from(citations)
        .where(and(eq(citations.auditId, latestAuditId), ORGANIC_ONLY))
        .groupBy(citations.engine)
        .orderBy(citations.engine);
    }

    return {
      brand,
      isFree,
      tier,
      auditCount,
      recentAudits: recentAuditsWithStatus,
      latestAudit: latestAuditWithStatus,
      avgPosition,
      totalMentions,
      sentimentScore,
      sentimentInsufficientData,
      engineStats,
    };
  });

  return (
    <>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name]} />
      <BrandDetailClient
        brand={JSON.parse(JSON.stringify(brand))}
        isFree={isFree}
        tier={tier}
        auditCount={Number(auditCount)}
        recentAudits={JSON.parse(JSON.stringify(recentAudits.reverse()))}
        latestAudit={latestAudit ? JSON.parse(JSON.stringify(latestAudit)) : null}
        avgPosition={avgPosition}
        totalMentions={totalMentions}
        sentimentScore={sentimentScore}
        sentimentInsufficientData={sentimentInsufficientData}
        engineStats={engineStats.map((e) => ({
          engine: e.engine,
          total: Number(e.total),
          mentions: Number(e.mentions),
        }))}
      />
    </>
  );
}
