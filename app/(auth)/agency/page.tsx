import { and, count, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PlanGatedLink } from "@/components/domain/pricing/plan-lock";
import { serviceDb, withRlsContext } from "@/db/client";
import { auditSchedules, brands, clientPortalInvites, driftAlerts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getOverviewMonth, monthWindowLabel } from "@/lib/dashboard/overview-cards";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";
import { formatVisibilityPercent } from "@/lib/scoring/visibility-display";
import { auditChanges } from "@/lib/visibility/audit-change";

const AGENCY_TIERS = ["agency", "agency_pro", "enterprise"];

export default async function AgencyDashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const tier = await effectiveTier(serviceDb, currentUser.organizationId);

  if (!AGENCY_TIERS.includes(tier)) {
    return (
      <div className="p-8">
        <div className="rounded-lg border bg-card p-6 max-w-lg mx-auto text-center">
          <h1 className="text-2xl font-semibold mb-2">Agency Dashboard</h1>
          <p className="text-muted-foreground mb-4">
            Upgrade to the Agency tier to manage your brands as a portfolio, with white-label report
            branding and client portals.
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

  const {
    brandCount,
    avgScore,
    averagedBrands,
    pendingDrifts,
    upcomingSchedules,
    auditsThisMonth,
    topMovers,
    notComparable,
    activePortals,
  } = await withRlsContext(orgId, async (tx) => {
    const [
      brandCountResult,
      pendingDriftResult,
      upcomingSchedulesResult,
      month,
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
      // Part 14 (Sri, 13 Nov): was "LLM Spend (This Month)" -- what we pay the providers is for operators
      // only (/admin/costs). The same Sydney-time month as the dashboard's "Audits this month".
      getOverviewMonth(tx, orgId, now),
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
          //
          // Vunnara (20 Oct, post-a093ceb), item 3: "latest"/"previous"
          // now pick strictly by recency among complete audits, no
          // longer skipping a zero-mention one -- sufficientMentionsExists
          // (removed, lib/audit/organic-filter.ts) existed to stop a
          // frequency_only composite being compared against a weighted
          // one, which no longer exists now the headline is always the
          // Frequency DimensionResult alone. A real 0% is a real, scored
          // measurement and must win "latest" over an older, better-
          // looking audit; compositeFor below still renders
          // insufficient_data (too few successful answers) as null, so
          // that state is shown honestly rather than hidden either way.
          // 14 Nov, part 5: and never one an operator excluded from trends (lib/audit/trend-exclusion.ts).
          latestAuditId: sql<string | null>`(
            SELECT a.id FROM audits a
            WHERE a.brand_id = "brands"."id"
              AND a.status = 'complete'
              AND a.excluded_from_trends_reason IS NULL
            ORDER BY a.completed_at DESC NULLS LAST, a.audit_number DESC
            LIMIT 1
          )`,
          previousAuditId: sql<string | null>`(
            SELECT a.id FROM audits a
            WHERE a.brand_id = "brands"."id"
              AND a.status = 'complete'
              AND a.excluded_from_trends_reason IS NULL
            ORDER BY a.completed_at DESC NULLS LAST, a.audit_number DESC
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
    // 17 Nov, part 3: each brand's move between its two latest audits, as their audit pages show them ("Audit #49 →
    // #50: 25% (10 of 40) → 27% (11 of 40), up 2 points"), only when the two are comparable (the drift baseline's rule)
    // -- lib/visibility/audit-change.ts, the one function every "before → after" uses. It showed "25% → 27%" with no
    // audits or counts, coloured by the raw difference (so "25% → 25%" could be green).
    const changes = await auditChanges(
      tx,
      brandAuditIdsResult.map((b) => ({
        key: b.brandId,
        beforeId: b.previousAuditId,
        afterId: b.latestAuditId,
      })),
    );

    function compositeFor(auditId: string | null): number | null {
      if (!auditId) return null;
      const resolved = resolvedByAuditId.get(auditId);
      if (!resolved) return null;
      // Headline = Frequency alone (never a blend). insufficient_data
      // (zero successful organic answers) -> null, so it's excluded from
      // the Avg KPI and Top Movers exactly like a missing audit.
      const headline = resolved.headline;
      return headline.status === "scored" ? headline.value : null;
    }

    const perBrand = brandAuditIdsResult.map((b) => ({
      brandId: b.brandId,
      brandName: b.brandName,
      latestComposite: compositeFor(b.latestAuditId),
      change: changes.get(b.brandId) ?? null,
    }));

    const latestComposites = perBrand
      .map((b) => b.latestComposite)
      .filter((v): v is number => v !== null);
    // The mean of each brand's latest Visibility, rounded like the audit
    // page -- "—" with nothing to average (it used to say "0").
    const avgScore =
      latestComposites.length === 0
        ? "—"
        : formatVisibilityPercent(
            latestComposites.reduce((a, b) => a + b, 0) / latestComposites.length,
          );

    const topMovers = perBrand
      .flatMap((b) =>
        b.change?.kind === "measured"
          ? [{ brandId: b.brandId, brandName: b.brandName, change: b.change }]
          : [],
      )
      .sort((a, b) => Math.abs(b.change.points) - Math.abs(a.change.points))
      .slice(0, 5);
    // Named with the reason, never a movement figure.
    const notComparable = perBrand.flatMap((b) =>
      b.change?.kind === "not_comparable"
        ? [{ brandId: b.brandId, brandName: b.brandName, label: b.change.reason }]
        : [],
    );

    return {
      brandCount: brandCountResult[0].count,
      avgScore,
      averagedBrands: latestComposites.length,
      pendingDrifts: pendingDriftResult[0].count,
      upcomingSchedules: upcomingSchedulesResult[0].count,
      auditsThisMonth: month.auditCount,
      topMovers,
      notComparable,
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
          <p className="text-sm text-muted-foreground">Avg Visibility</p>
          <p className="text-3xl font-bold mt-1">{avgScore}</p>
          {/* 17 Nov, part 3: what it averages (as the dashboard's card says). */}
          <p className="text-xs text-muted-foreground mt-1">
            {averagedBrands === 0
              ? "No brand has a measured audit"
              : `Each latest audit of ${averagedBrands} brand${averagedBrands === 1 ? "" : "s"}, not counting audits excluded from trends`}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Pending Drift Alerts</p>
          <p className="text-3xl font-bold mt-1">{pendingDrifts}</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Audits this month</p>
          <p className="text-3xl font-bold mt-1">{auditsThisMonth}</p>
          <p className="text-xs text-muted-foreground mt-1">{monthWindowLabel(now, orgId)}</p>
        </div>
      </div>

      {/* Second row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top movers */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Top Movers</h2>
          {topMovers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {notComparable.length === 0
                ? "No Visibility changes yet. Run audits to see movement."
                : "No comparable Visibility changes yet."}
            </p>
          ) : (
            <ul className="space-y-3">
              {topMovers.map((m) => (
                <li key={m.brandId} className="flex items-start justify-between gap-3">
                  <a href={`/brands/${m.brandId}`} className="text-sm font-medium hover:underline">
                    {m.brandName}
                  </a>
                  <span
                    className={`text-right text-sm font-mono ${
                      m.change.direction === "up"
                        ? "text-green-600"
                        : m.change.direction === "down"
                          ? "text-red-600"
                          : "text-muted-foreground"
                    }`}
                    data-mover-line=""
                  >
                    {/* Both audits' Visibility, as each audit page shows it, with their numbers and counts. */}
                    <span className="font-semibold">
                      {m.change.before.value} → {m.change.after.value}
                    </span>
                    <span className="block text-xs text-muted-foreground font-sans">
                      #{m.change.before.auditNumber} ({m.change.before.counts}) → #
                      {m.change.after.auditNumber} ({m.change.after.counts})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {notComparable.length > 0 && (
            <ul className="space-y-2 mt-3">
              {notComparable.map((b) => (
                <li key={b.brandId} className="flex items-center justify-between">
                  <a href={`/brands/${b.brandId}`} className="text-sm font-medium hover:underline">
                    {b.brandName}
                  </a>
                  <span className="text-sm text-muted-foreground">{b.label}</span>
                </li>
              ))}
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
            style={{ color: "var(--accent-blue)" }}
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
            <PlanGatedLink
              feature="bulk_operations"
              tier={tier}
              className="flex items-center gap-2 rounded-md border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
              trailing={<span className="text-muted-foreground">›</span>}
            >
              <span className="flex-1">Run audits across all {brandCount} brands</span>
            </PlanGatedLink>
            <a
              href="/agency/reports/pdf-builder"
              className="flex items-center justify-between rounded-md border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <span>Generate client reports (white-label)</span>
              <span className="text-muted-foreground">›</span>
            </a>
            <PlanGatedLink
              feature="bulk_operations"
              tier={tier}
              className="flex items-center gap-2 rounded-md border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
              trailing={<span className="text-muted-foreground">›</span>}
            >
              <span className="flex-1">Export to CSV (all audits)</span>
            </PlanGatedLink>
            <PlanGatedLink
              feature="white_label_reports"
              tier={tier}
              className="flex items-center gap-2 rounded-md border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
              trailing={<span className="text-muted-foreground">›</span>}
            >
              <span className="flex-1">Report branding &amp; logo</span>
            </PlanGatedLink>
          </div>
        </div>

        {/* Client-facing portals */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Client-Facing Portals</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Each client gets a read-only portal showing their brand&apos;s data — your branding, not
            ours.
          </p>
          <p className="text-sm mb-4">
            <span className="text-2xl font-bold">{activePortals}</span>{" "}
            <span className="text-muted-foreground">
              active portal{activePortals !== 1 ? "s" : ""}
            </span>
          </p>
          <div className="space-y-1">
            <PlanGatedLink
              feature="client_portal"
              tier={tier}
              className="flex items-center gap-2 rounded-md border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
              trailing={<span className="text-muted-foreground">›</span>}
            >
              <span className="flex-1">Manage portals</span>
            </PlanGatedLink>
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
