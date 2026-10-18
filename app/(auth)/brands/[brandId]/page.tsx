import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, citations } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { getCurrentUser } from "@/lib/auth/current-user";
import { NOT_MEASURED_DIMENSION, resolveComposite } from "@/lib/scoring/dimension-result";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";
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
        completedAt: audits.completedAt,
        // Vunnara Build 1, Part E.2: lets the sparkline mark "questions
        // changed" between two consecutive audits that ran a different
        // prompt-pack generation, instead of implying a smooth trend.
        promptPackVersion: audits.promptPackVersion,
      })
      .from(audits)
      .where(and(eq(audits.brandId, brand.id), eq(audits.status, "complete")))
      .orderBy(desc(audits.completedAt))
      .limit(12);

    const latestAudit = recentAudits[0] ?? null;
    const latestAuditId = latestAudit?.id ?? null;

    // Task #46 (fix: stored value contradicting its own CI): every
    // recentAudit's composite -- the sparkline's 12 points and the
    // "Visibility score" KPI tile -- comes from the SAME read-time
    // recompute over real citations the audit detail page itself uses
    // (lib/scoring/resolve-audit-dimensions.ts), never the stored
    // audits.score_* columns, which go stale the moment a prod-fix
    // changes which rows count as organic without the audit being
    // re-run. Batched -- one query covers all 12 audit ids, no N+1.
    const resolvedByAuditId = await resolveOrganicDimensions(
      tx,
      recentAudits.map((a) => a.id),
    );
    const isInsufficientData = (auditId: string) =>
      (resolvedByAuditId.get(auditId)?.mentionedCount ?? 0) === 0;

    function recomputeComposite(auditId: string): string | null {
      const resolved = resolvedByAuditId.get(auditId);
      if (!resolved) return null;
      const composite = resolveComposite({
        frequency: resolved.frequency,
        position: resolved.position,
        sentiment: NOT_MEASURED_DIMENSION,
        context: NOT_MEASURED_DIMENSION,
        accuracy: resolved.accuracy,
      });
      // toFixed(2) matches the stored numeric(5,2) column's own string
      // format ("0.00", "62.30") that every caller of this field already
      // expects (e.g. Number.parseFloat(...).toFixed(1) downstream).
      return composite.value.toFixed(2);
    }

    const recentAuditsWithStatus = recentAudits.map((a) => ({
      scoreComposite: recomputeComposite(a.id),
      completedAt: a.completedAt,
      insufficientData: isInsufficientData(a.id),
      promptPackVersion: a.promptPackVersion,
    }));
    const latestAuditWithStatus = latestAudit
      ? {
          scoreComposite: recomputeComposite(latestAudit.id),
          insufficientData: isInsufficientData(latestAudit.id),
        }
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
