import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, citations } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { getCurrentUser } from "@/lib/auth/current-user";
import { NOT_MEASURED_DIMENSION, resolveComposite, resolveDimension } from "@/lib/scoring/dimension-result";
import { wilsonCI, wilsonCIFromScore } from "@/lib/scoring/wilson";
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
        scoreFrequency: audits.scoreFrequency,
        scorePosition: audits.scorePosition,
        scoreAccuracy: audits.scoreAccuracy,
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
    // Task #46 Phase 3, Part C: also pulls sampleCount/accWithSourcesCount
    // now (not just mentionCount) so every recentAudit's composite can be
    // RECOMPUTED live via resolveComposite below, excluding Sentiment/
    // Context -- the stored audits.score_composite column is stale for
    // any audit scored before this fix (it was blended with Sentiment/
    // Context fabricated from mention presence at 20%/15% weight). This
    // mirrors app/api/badge/route.ts's own fix for the same staleness.
    const mentionCountRows =
      mentionCountAuditIds.length > 0
        ? await tx
            .select({
              auditId: citations.auditId,
              sampleCount: count(),
              mentionCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
              accWithSourcesCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true AND jsonb_array_length(cited_sources) > 0 THEN 1 ELSE 0 END), 0)`,
            })
            .from(citations)
            .where(and(inArray(citations.auditId, mentionCountAuditIds), ORGANIC_ONLY, eq(citations.runNumber, 1)))
            .groupBy(citations.auditId)
        : [];
    // Postgres SUM() surfaces as a string via the JS driver -- coerce once
    // here so every downstream `=== 0` / truthiness check means what it says
    // (see lib/scoring/dimension-result.ts's own comment on this).
    // sampleCount is a plain count() and is already a real number.
    const countsByAuditId = new Map(
      mentionCountRows.map((r) => [
        r.auditId,
        {
          sampleCount: r.sampleCount,
          mentionCount: Number(r.mentionCount),
          accWithSourcesCount: Number(r.accWithSourcesCount),
        },
      ]),
    );
    const isInsufficientData = (auditId: string) =>
      (countsByAuditId.get(auditId)?.mentionCount ?? 0) === 0;

    // Recomputes one audit's composite from its stored scoreFrequency/
    // scorePosition/scoreAccuracy + its real citations-derived mention
    // counts, honestly excluding Sentiment/Context -- same contract as
    // app/(auth)/audits/[auditId]/page.tsx and the export route.
    function recomputeComposite(a: {
      id: string;
      scoreComposite: string | null;
      scoreFrequency: string | null;
      scorePosition: string | null;
      scoreAccuracy: string | null;
    }): string | null {
      if (a.scoreComposite == null) return null;
      const counts = countsByAuditId.get(a.id);
      const mentioned = counts?.mentionCount ?? 0;
      const sampleCount = counts?.sampleCount ?? 0;
      const accWithSources = counts?.accWithSourcesCount ?? 0;
      const frequency = resolveDimension(
        Number(a.scoreFrequency ?? 0),
        wilsonCI(mentioned, sampleCount),
        mentioned,
        { alwaysScored: true },
      );
      const position = resolveDimension(
        Number(a.scorePosition ?? 0),
        wilsonCIFromScore(Number(a.scorePosition ?? 0), mentioned),
        mentioned,
      );
      const accuracy = resolveDimension(
        Number(a.scoreAccuracy ?? 0),
        wilsonCI(accWithSources, mentioned),
        mentioned,
      );
      const composite = resolveComposite({
        frequency,
        position,
        sentiment: NOT_MEASURED_DIMENSION,
        context: NOT_MEASURED_DIMENSION,
        accuracy,
      });
      // toFixed(2) matches the stored numeric(5,2) column's own string
      // format ("0.00", "62.30") that every caller of this field already
      // expects (e.g. Number.parseFloat(...).toFixed(1) downstream).
      return composite.value.toFixed(2);
    }

    const recentAuditsWithStatus = recentAudits.map((a) => ({
      scoreComposite: recomputeComposite(a),
      completedAt: a.completedAt,
      insufficientData: isInsufficientData(a.id),
    }));
    const latestAuditWithStatus = latestAudit
      ? { scoreComposite: recomputeComposite(latestAudit), insufficientData: isInsufficientData(latestAudit.id) }
      : null;

    let avgPosition: number | null = null;
    let totalMentions = 0;
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
        engineStats={engineStats.map((e) => ({
          engine: e.engine,
          total: Number(e.total),
          mentions: Number(e.mentions),
        }))}
      />
    </>
  );
}
