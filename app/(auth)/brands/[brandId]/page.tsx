import { and, count, desc, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { DirectoryListingsCard } from "@/components/domain/brand/directory-listings-card";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, citations } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { getCurrentUser } from "@/lib/auth/current-user";
import { brandNeedsClassificationConfirmation } from "@/lib/brands/needs-confirmation";
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
        // Vunnara Build 1, Part G.7: same marker, for a methodology
        // change (memory-only vs web-grounded) between two audits.
        methodologyVersion: audits.methodologyVersion,
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
    // "Zero mentions over real answers" -- a real, scored 0% headline that
    // the client renders as "Not mentioned" / a dashed sparkline point.
    // Deliberately false when the headline itself is insufficient_data
    // (zero successful organic answers at all): "Not mentioned" would
    // imply answers existed. That case gets scoreComposite = null below
    // instead -> "—" on the KPI tile and omitted from the sparkline.
    const isInsufficientData = (auditId: string) => {
      const resolved = resolvedByAuditId.get(auditId);
      return resolved?.headline.status === "scored" && resolved.mentionedCount === 0;
    };

    // Headline = the Frequency DimensionResult alone, never a blend.
    function recomputeComposite(auditId: string): string | null {
      const headline = resolvedByAuditId.get(auditId)?.headline;
      if (!headline || headline.status !== "scored") return null;
      // toFixed(2) matches the stored numeric(5,2) column's own string
      // format ("0.00", "62.30") that every caller of this field already
      // expects (e.g. Number.parseFloat(...).toFixed(1) downstream).
      return headline.value.toFixed(2);
    }

    const recentAuditsWithStatus = recentAudits.map((a) => ({
      scoreComposite: recomputeComposite(a.id),
      completedAt: a.completedAt,
      insufficientData: isInsufficientData(a.id),
      promptPackVersion: a.promptPackVersion,
      methodologyVersion: a.methodologyVersion,
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
      // Vunnara (21 Oct, hotfix: "Usually #16") -- this used to run its
      // own `avg(citations.position)` SQL directly over the stale,
      // character-offset-heuristic column (the same class of bug as the
      // audit page's own card). resolvedByAuditId above already
      // recomputed this exact audit's real median rank from the actual
      // response text (lib/scoring/resolve-audit-dimensions.ts) -- reuse
      // it instead of a second, independently-wrong query.
      avgPosition = resolvedByAuditId.get(latestAuditId)?.medianPosition ?? null;

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
            // Vunnara Build 1, Part F.3: this spans every completed
            // audit the brand has ever had -- a historical audit from
            // before Part F.1 removed the replay loop can have up to 5
            // rows per real mention. run_number = 1 keeps this lifetime
            // KPI counting true distinct observations, not replays.
            eq(citations.runNumber, 1),
          ),
        );
      totalMentions = Number(mentionRows[0]?.cnt ?? 0);

      // Audit #36: the same per-engine split the latest audit's headline
      // sums (successful everyday answers, run 1, verified mentions) --
      // it used to count every run and unverified matches too.
      engineStats = (resolvedByAuditId.get(latestAuditId)?.perEngine ?? []).map((e) => ({
        engine: e.engine,
        total: e.sampleCount,
        mentions: e.mentionedCount,
      }));
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

  // Build 1 addendum, item 10: re-derive classification_status at read
  // time against today's confirmation bar -- a stored "complete" from
  // the OLD classifier (Omega-shaped: category not a real enum key,
  // or confidence < 0.7) is upgraded to "needs_confirmation" here,
  // never trusted as-is. No data edit; the stored column is untouched.
  const effectiveClassificationStatus = brandNeedsClassificationConfirmation({
    classificationStatus: brand.classificationStatus,
    classification: brand.classification,
    categoryConfirmedAt: brand.categoryConfirmedAt,
    categories: brand.categories,
    audience: brand.audience,
  })
    ? "needs_confirmation"
    : brand.classificationStatus;

  return (
    <>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name]} />
      <BrandDetailClient
        brand={{
          ...JSON.parse(JSON.stringify(brand)),
          classificationStatus: effectiveClassificationStatus,
        }}
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
      <div style={{ padding: "0 24px 24px" }}>
        <DirectoryListingsCard brandId={brand.id} />
      </div>
    </>
  );
}
