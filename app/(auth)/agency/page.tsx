import { addMonths, startOfMonth } from "date-fns";
import { and, count, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, setRlsContext } from "@/db/client";
import { audits, auditSchedules, brands, clientPortalInvites, driftAlerts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const AGENCY_TIERS = ["agency", "agency_pro", "enterprise"];

export default async function AgencyDashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  if (!AGENCY_TIERS.includes(currentUser.organization.tier)) {
    return (
      <div className="p-8">
        <div className="rounded-lg border bg-card p-6 max-w-lg mx-auto text-center">
          <h1 className="text-2xl font-semibold mb-2">Agency Dashboard</h1>
          <p className="text-muted-foreground mb-4">
            Upgrade to the Agency tier to access portfolio management, bulk operations,
            white-label reports, and client portals.
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
  await setRlsContext(db, orgId);
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = addMonths(monthStart, 1);

  const [
    brandCountResult,
    avgScoreResult,
    pendingDriftResult,
    upcomingSchedulesResult,
    spendResult,
    topMoversResult,
    activePortalsResult,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(brands)
      .where(and(eq(brands.organizationId, orgId), isNull(brands.deletedAt))),
    db
      .select({
        avg: sql<string>`COALESCE(ROUND(AVG(score_composite::numeric), 1)::text, '0')`,
      })
      .from(audits)
      .where(and(eq(audits.organizationId, orgId), eq(audits.status, "complete"))),
    db
      .select({ count: count() })
      .from(driftAlerts)
      .where(and(eq(driftAlerts.organizationId, orgId), eq(driftAlerts.acknowledged, false))),
    db
      .select({ count: count() })
      .from(auditSchedules)
      .where(and(eq(auditSchedules.organizationId, orgId), eq(auditSchedules.status, "active"))),
    db
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
    db
      .select({
        brandName: brands.name,
        brandId: brands.id,
        scoreDelta: sql<string>`(
          SELECT ROUND((a1.score_composite::numeric - a2.score_composite::numeric), 1)::text
          FROM audits a1
          JOIN audits a2 ON a2.brand_id = a1.brand_id
            AND a2.status = 'complete'
            AND a2.completed_at < a1.completed_at
          WHERE a1.brand_id = "brands"."id"
            AND a1.status = 'complete'
          ORDER BY a1.completed_at DESC, a2.completed_at DESC
          LIMIT 1
        )`,
      })
      .from(brands)
      .where(and(eq(brands.organizationId, orgId), isNull(brands.deletedAt)))
      .orderBy(
        desc(
          sql`ABS(COALESCE((
            SELECT (a1.score_composite::numeric - a2.score_composite::numeric)
            FROM audits a1
            JOIN audits a2 ON a2.brand_id = a1.brand_id
              AND a2.status = 'complete'
              AND a2.completed_at < a1.completed_at
            WHERE a1.brand_id = "brands"."id"
              AND a1.status = 'complete'
            ORDER BY a1.completed_at DESC, a2.completed_at DESC
            LIMIT 1
          ), 0))`,
        ),
      )
      .limit(5),
    db
      .select({ count: count() })
      .from(clientPortalInvites)
      .where(
        and(
          eq(clientPortalInvites.organizationId, orgId),
          eq(clientPortalInvites.status, "active"),
          eq(clientPortalInvites.isRevoked, false),
        ),
      ),
  ]);

  const brandCount = brandCountResult[0].count;
  const avgScore = avgScoreResult[0]?.avg || "0";
  const pendingDrifts = pendingDriftResult[0].count;
  const upcomingSchedules = upcomingSchedulesResult[0].count;
  const spendUsd = parseFloat(spendResult[0].total || "0");
  const topMovers = topMoversResult.filter((m) => m.scoreDelta !== null);
  const activePortals = activePortalsResult[0].count;

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
                const delta = parseFloat(m.scoreDelta!);
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
                        delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-muted-foreground"
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
