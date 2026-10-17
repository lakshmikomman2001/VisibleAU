import { addMonths, startOfMonth } from "date-fns";
import { and, count, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { serviceDb, withRlsContext } from "@/db/client";
import { auditSchedules, audits, brands, clientPortalInvites, driftAlerts } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { sufficientMentionsExists } from "@/lib/audit/organic-filter";
import { getCurrentUser } from "@/lib/auth/current-user";
import { NOT_MEASURED_DIMENSION, resolveComposite } from "@/lib/scoring/dimension-result";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";

const AGENCY_TIERS = ["agency", "agency_pro", "enterprise"];

export default async function AgencyDashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const [sub] = await serviceDb
    .select({ tier: subscriptions.tier })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, currentUser.organizationId))
    .limit(1);
  const tier = sub?.tier ?? "free";

  if (!AGENCY_TIERS.includes(tier)) {
    return (
      <div className="p-8">
        <div className="rounded-lg border bg-card p-6 max-w-lg mx-auto text-center">
          <h1 className="text-2xl font-semibold mb-2">Agency Dashboard</h1>
          <p className="text-muted-foreground mb-4">
            Upgrade to the Agency tier to access portfolio management, bulk operations, white-label
            reports, and client portals.
          </p>
          <a
            href="/settings/billing"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
          >
            Upgrade to Agency
          </a>
        </div>
      </div>
    );
  }

  const orgId = currentUser.organization.id;
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = addMonths(monthStart, 1);

  const {
    brandCount,
    avgScore,
    pendingDrifts,
    upcomingSchedules,
    spendUsd,
    topMovers,
    activePortals,
  } = await withRlsContext(orgId, async (tx) => {
    const [
      brandCountResult,
      pendingDriftResult,
      upcomingSchedulesResult,
      spendResult,
      activePortalsResult,
      brandAuditIdsResult,
    ] = await Promise.all([
      tx
        .select({ count: count() })
        .from(brands)
        .where(and(eq(brands.organizationId, orgId), isNull(brands.deletedAt))),
      tx
        .select({ count: count() })
        .from(driftAlerts)
        .where(and(eq(driftAlerts.organizationId, orgId), eq(driftAlerts.acknowledged, false))),
      tx
        .select({ count: count() })
        .from(auditSchedules)
        .where(and(eq(auditSchedules.organizationId, orgId), eq(auditSchedules.status, "active"))),
      tx
        .select({ total: sql<string>`COALESCE(SUM(total_cost_usd), 0)` })
        .from(audits)
        .where(
          and(
            eq(audits.organizationId, orgId),
            eq(audits.status, "complete"),
            gte(audits.createdAt, monthStart),
            lt(audits.createdAt, monthEnd),
          ),
        ),
      tx
        .select({ count: count() })
        .from(clientPortalInvites)
        .where(
          and(
            eq(clientPortalInvites.organizationId, orgId),
            eq(clientPortalInvites.status, "active"),
            eq(clientPortalInvites.isRevoked, false),
          ),
        ),
      tx
        .select({
          brandId: brands.id,
          brandName: brands.name,
          // Task #46 (fix: stored value contradicting its own CI),
          // follow-up #2: resolve to an AUDIT ID, not a stored
          // score_composite -- the composite is recomputed live below,
          // in ONE batched call across every brand's latest+previous
          // audit (lib/scoring/resolve-audit-dimensions.ts), the same
          // read-time contract every other surface already uses.
          // "latest"/"previous" still skip over any zero-mention audit
          // entirely (same rule as before -- a frequency_only composite
          // is real but not a 5-dimension measurement, so it's never
          // used as either side of the Avg Composite KPI or the Top
          // Movers delta).
          latestAuditId: sql<string | null>`(
            SELECT a.id FROM audits a
            WHERE a.brand_id = "brands"."id"
              AND a.status = 'complete'
              AND ${sufficientMentionsExists(sql.raw("a.id"))}
            ORDER BY a.completed_at DESC
            LIMIT 1
          )`,
          previousAuditId: sql<string | null>`(
            SELECT a.id FROM audits a
            WHERE a.brand_id = "brands"."id"
              AND a.status = 'complete'
              AND ${sufficientMentionsExists(sql.raw("a.id"))}
            ORDER BY a.completed_at DESC
            OFFSET 1
            LIMIT 1
          )`,
        })
        .from(brands)
        .where(and(eq(brands.organizationId, orgId), isNull(brands.deletedAt))),
    ]);

    // One batched query for every latest/previous audit id across every
    // brand in the org -- never one query per brand.
    const auditIds = brandAuditIdsResult
      .flatMap((b) => [b.latestAuditId, b.previousAuditId])
      .filter((id): id is string => id !== null);
    const resolvedByAuditId = await resolveOrganicDimensions(tx, auditIds);

    function compositeFor(auditId: string | null): number | null {
      if (!auditId) return null;
      const resolved = resolvedByAuditId.get(auditId);
      if (!resolved) return null;
      return resolveComposite({
        frequency: resolved.frequency,
        position: resolved.position,
        sentiment: NOT_MEASURED_DIMENSION,
        context: NOT_MEASURED_DIMENSION,
        accuracy: resolved.accuracy,
      }).value;
    }

    const perBrand = brandAuditIdsResult.map((b) => ({
      brandId: b.brandId,
      brandName: b.brandName,
      latestComposite: compositeFor(b.latestAuditId),
      previousComposite: compositeFor(b.previousAuditId),
    }));

    const latestComposites = perBrand
      .map((b) => b.latestComposite)
      .filter((v): v is number => v !== null);
    const avgScore =
      latestComposites.length === 0
        ? "0"
        : (latestComposites.reduce((a, b) => a + b, 0) / latestComposites.length).toFixed(1);

    const topMovers = perBrand
      .filter(
        (b): b is typeof b & { latestComposite: number; previousComposite: number } =>
          b.latestComposite !== null && b.previousComposite !== null,
      )
      .map((b) => ({
        brandId: b.brandId,
        brandName: b.brandName,
        scoreDelta: b.latestComposite - b.previousComposite,
      }))
      .sort((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta))
      .slice(0, 5);

    return {
      brandCount: brandCountResult[0].count,
      avgScore,
      pendingDrifts: pendingDriftResult[0].count,
      upcomingSchedules: upcomingSchedulesResult[0].count,
      spendUsd: parseFloat(spendResult[0].total || "0"),
      topMovers,
      activePortals: activePortalsResult[0].count,
    };
  });

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Agency Dashboard</h1>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Total Brands</p>
          <p className="text-3xl font-bold mt-1">{brandCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Avg Composite Score</p>
          <p className="text-3xl font-bold mt-1">{avgScore}</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Pending Drift Alerts</p>
          <p className="text-3xl font-bold mt-1">{pendingDrifts}</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">LLM Spend (This Month)</p>
          <p className="text-3xl font-bold mt-1">US${spendUsd.toFixed(2)}</p>
        </div>
      </div>

      {/* Second row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top movers */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Top Movers</h2>
          {topMovers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No score changes yet. Run audits to see movement.
            </p>
          ) : (
            <ul className="space-y-3">
              {topMovers.map((m) => {
                const delta = m.scoreDelta;
                return (
                  <li key={m.brandId} className="flex items-center justify-between">
                    <a
                      href={`/brands/${m.brandId}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {m.brandName}
                    </a>
                    <span
                      className={`text-sm font-mono font-semibold ${
                        delta > 0
                          ? "text-green-600"
                          : delta < 0
                            ? "text-red-600"
                            : "text-muted-foreground"
                      }`}
                    >
                      {delta > 0 ? "+" : ""}
                      {delta.toFixed(1)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Scheduled audits */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Scheduled Audits</h2>
          <p className="text-sm text-muted-foreground">
            {upcomingSchedules} active schedule{upcomingSchedules !== 1 ? "s" : ""} configured.
          </p>
          <a
            href="/agency/schedules"
            className="inline-block mt-3 text-sm hover:underline"
            style={{ color: "#3b82f6" }}
          >
            Manage schedules
          </a>
        </div>
      </div>

      {/* Third row — entry-point cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Bulk actions */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Bulk Actions</h2>
          <div className="space-y-1">
            <a
              href="/agency/bulk"
              className="flex items-center justify-between rounded-md border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <span>Run audits across all {brandCount} brands</span>
              <span className="text-muted-foreground">›</span>
            </a>
            <a
              href="/agency/reports/pdf-builder"
              className="flex items-center justify-between rounded-md border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <span>Generate client reports (white-label)</span>
              <span className="text-muted-foreground">›</span>
            </a>
            <a
              href="/agency/bulk"
              className="flex items-center justify-between rounded-md border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <span>Export to CSV (all audits)</span>
              <span className="text-muted-foreground">›</span>
            </a>
            <a
              href="/agency/branding"
              className="flex items-center justify-between rounded-md border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <span>Branding &amp; logo</span>
              <span className="text-muted-foreground">›</span>
            </a>
          </div>
        </div>

        {/* Client-facing portals */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Client-Facing Portals</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Each client gets a read-only portal showing their brand&apos;s data — your branding, no
            VisibleAU.
          </p>
          <p className="text-sm mb-4">
            <span className="text-2xl font-bold">{activePortals}</span>{" "}
            <span className="text-muted-foreground">
              active portal{activePortals !== 1 ? "s" : ""}
            </span>
          </p>
          <div className="space-y-1">
            <a
              href="/agency/client-portals"
              className="flex items-center justify-between rounded-md border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <span>Manage portals</span>
              <span className="text-muted-foreground">›</span>
            </a>
            <a
              href="/settings/notifications"
              className="flex items-center justify-between rounded-md border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <span>Notification preferences</span>
              <span className="text-muted-foreground">›</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
