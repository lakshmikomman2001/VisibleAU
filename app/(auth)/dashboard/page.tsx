import { formatDistanceToNow } from "date-fns";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Activity, ArrowRight, Building2, ChevronRight, MapPin, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionProgressTracker } from "@/components/domain/autopilot/action-progress-tracker";
import { AutopilotBrandPicker } from "@/components/domain/autopilot/autopilot-brand-picker";
import { HealthCheckBanner } from "@/components/domain/autopilot/health-check-banner";
import { PersonaDashboard } from "@/components/domain/autopilot/persona-dashboard";
import { InfoTip } from "@/components/domain/shared/info-tip";
import { DashboardSovStrip } from "@/components/domain/visibility/dashboard-sov-strip";
import { VisibilityCell } from "@/components/shared/visibility-cell";
import { withRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { engineCoverageLabel } from "@/lib/audit/engine-failure";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isTierAtLeast } from "@/lib/brands";
import {
  AVG_VISIBILITY_NOTE,
  averageVisibility,
  averageVisibilitySub,
  getOverviewMonth,
  monthWindowLabel,
  SPEND_CARD_LABEL,
  spendCard,
} from "@/lib/dashboard/overview-cards";
import {
  healthCheckBannerNotice,
  isNoticeDismissed,
  PRODUCT_TOUR_NOTICE,
} from "@/lib/onboarding/dismissed-notices";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";
import { auditVisibilityDisplay, formatVisibilityPercent } from "@/lib/scoring/visibility-display";
import { formatLocation } from "@/lib/verticals/expand-prompt";
import { shareOfVoiceForBrands, sovLine } from "@/lib/visibility/share-of-voice";
import { DashboardShell } from "./dashboard-shell";

/** Share of Voice lines on the Overview; the rest are one link away. */
const SOV_LINES_SHOWN = 10;

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: "var(--accent-muted)", color: "var(--text-secondary)" },
  running: { bg: "var(--info-soft)", color: "var(--info)" },
  complete: { bg: "var(--success-soft)", color: "var(--success)" },
  failed: { bg: "var(--danger-soft)", color: "var(--danger)" },
};

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const orgId = currentUser.organizationId;
  const firstName = (currentUser.name ?? "").split(" ")[0] || "there";

  const tier = await withRlsContext(orgId, (tx) => effectiveTier(tx, orgId));
  const isGrowthPlus = isTierAtLeast(tier, "growth");

  const now = new Date();

  const { brandCount, month, avg, sovLines, switcherBrand, pickerBrands, recentAudits } =
    await withRlsContext(orgId, async (tx) => {
      const brandRows = await tx
        .select({
          id: brands.id,
          name: brands.name,
          vertical: brands.vertical,
          competitors: brands.competitors,
          competitorWebsites: brands.competitorWebsites,
        })
        .from(brands)
        .where(and(eq(brands.organizationId, orgId), isNull(brands.deletedAt)))
        .orderBy(brands.name, brands.id);
      const brandCount = brandRows.length;

      if (brandCount === 0) redirect("/brands/wizard");

      const [month, recentAuditsRaw, latestCompleteRows] = await Promise.all([
        // Overview (7 Nov), item 1: "Audits this month" and "LLM spend" count the same audits --
        // created this calendar month in Sydney time, any status -- and the spend is what their
        // calls recorded (lib/dashboard/overview-cards.ts), not audits.total_cost_usd of complete ones.
        getOverviewMonth(tx, orgId, now),
        tx
          .select({
            id: audits.id,
            brandName: brands.name,
            primaryRegions: brands.primaryRegions,
            status: audits.status,
            createdAt: audits.createdAt,
            engines: audits.engines,
            promptsCount: audits.promptsCount,
            metadata: audits.metadata,
          })
          .from(audits)
          .innerJoin(brands, eq(audits.brandId, brands.id))
          .where(eq(audits.organizationId, orgId))
          .orderBy(desc(audits.createdAt))
          .limit(5),
        // Task BBB: each brand's LATEST completed audit, never every historical row. DISTINCT ON
        // (brand_id) picks one per brand; Task #46 follow-up #2: its Visibility is recomputed live
        // below, never the stored score_composite. Overview (7 Nov), item 2: brands that still exist
        // only -- a deleted brand's last audit used to stay in the average.
        tx
          .selectDistinctOn([audits.brandId], {
            id: audits.id,
            brandId: audits.brandId,
            auditNumber: audits.auditNumber,
            completedAt: audits.completedAt,
            methodologyVersion: audits.methodologyVersion,
            engines: audits.engines,
            promptsCount: audits.promptsCount,
            metadata: audits.metadata,
          })
          .from(audits)
          .innerJoin(brands, and(eq(brands.id, audits.brandId), isNull(brands.deletedAt)))
          .where(and(eq(audits.organizationId, orgId), eq(audits.status, "complete")))
          .orderBy(audits.brandId, sql`${audits.completedAt} DESC NULLS LAST`),
      ]);

      const latestByBrand = new Map(latestCompleteRows.map((r) => [r.brandId, r]));
      const recentCompleteAuditIds = recentAuditsRaw
        .filter((a) => a.status === "complete")
        .map((a) => a.id);
      const resolvedByAuditId = await resolveOrganicDimensions(tx, [
        ...new Set([...latestCompleteRows.map((r) => r.id), ...recentCompleteAuditIds]),
      ]);

      // Headline = Frequency alone (never a blend). A brand with no complete audit, or whose latest
      // one is below the answer minimum (insufficient_data), is counted and named, never averaged.
      const avg = averageVisibility(
        brandRows.map((brand) => {
          const latest = latestByBrand.get(brand.id);
          return {
            headline: latest ? (resolvedByAuditId.get(latest.id)?.headline ?? null) : null,
            // URGENT audit #37 (31 Oct), item 2: a latest audit in which a whole engine failed.
            missingAnEngine: latest ? engineCoverageLabel(latest) !== null : false,
          };
        }),
      );

      // Overview (7 Nov), item 3: one Share of Voice line per brand, from each brand's latest
      // complete audit and the headline's own counts (lib/visibility/share-of-voice.ts).
      const sov = await shareOfVoiceForBrands(
        tx,
        brandRows.slice(0, SOV_LINES_SHOWN).map((brand) => {
          const latest = latestByBrand.get(brand.id);
          return { ...brand, latest: latest ?? null };
        }),
        resolvedByAuditId,
      );

      const recentAudits = recentAuditsRaw.map(({ metadata, engines, promptsCount, ...a }) => ({
        ...a,
        visibility: {
          ...auditVisibilityDisplay(a.status, resolvedByAuditId.get(a.id)),
          coverage:
            a.status === "complete"
              ? engineCoverageLabel({ engines, promptsCount, metadata })
              : null,
        },
      }));

      return {
        brandCount,
        month,
        avg,
        sovLines: sov.map((entry) => sovLine(entry, orgId)),
        // Overview (7 Nov), item 4: on this page the brand switcher shows a brand only when the
        // workspace has exactly one (components/domain/agency/workspace-switcher.tsx); with more,
        // nothing is selected, so no brand's banner is picked for it.
        switcherBrand: brandCount === 1 ? brandRows[0] : null,
        // No arbitrary "first brand" (7 Nov): Autopilot asks which brand when none is selected.
        pickerBrands: brandRows.slice(0, SOV_LINES_SHOWN).map(({ id, name }) => ({ id, name })),
        recentAudits,
      };
    });

  const spend = spendCard(month);
  const kpis: Array<{
    label: string;
    value: string;
    icon: typeof Building2;
    sub: string | null;
    note?: string;
  }> = [
    { label: "Brands tracked", value: String(brandCount), icon: Building2, sub: null },
    {
      label: "Audits this month",
      value: String(month.auditCount),
      icon: Sparkles,
      sub: monthWindowLabel(now, orgId),
    },
    {
      label: "Avg visibility",
      value: avg.value === null ? "—" : formatVisibilityPercent(avg.value),
      icon: Activity,
      sub: averageVisibilitySub(avg),
      note: AVG_VISIBILITY_NOTE,
    },
    { label: SPEND_CARD_LABEL, value: spend.value, icon: Zap, sub: spend.sub, note: spend.note },
  ];

  const orgMeta = (currentUser.organization.metadata ?? {}) as Record<string, unknown>;
  // Each person's own (Sri, 8 Nov); a workspace whose tour was ended for everyone before that keeps it ended.
  const showTour =
    !orgMeta.productTourComplete &&
    !isNoticeDismissed(orgMeta, currentUser.id, PRODUCT_TOUR_NOTICE);
  const bannerBrand =
    isGrowthPlus &&
    switcherBrand &&
    !isNoticeDismissed(orgMeta, currentUser.id, healthCheckBannerNotice(switcherBrand.id))
      ? switcherBrand
      : null;

  return (
    <DashboardShell showTour={showTour}>
      <div style={{ padding: "28px 32px" }}>
        {/* FIX 6: Welcome header */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 32,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              Welcome back, {firstName}.
            </h1>
            <p
              style={{
                fontSize: 14,
                marginTop: 4,
                color: "var(--text-secondary)",
                margin: "4px 0 0",
              }}
            >
              Here&apos;s what&apos;s happening across your brands.
            </p>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "2px 8px",
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 500,
              background: "var(--success-soft)",
              color: "var(--success)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--success)",
                animation: "pulse-soft 2.4s ease-in-out infinite",
              }}
            />
            All systems normal
          </span>
        </div>

        {/* FIX 7: KPI cards with icons + mono font */}
        {/* Two columns below 1024px, four from there up. */}
        <div
          data-tour="kpi-cards"
          className="grid grid-cols-2 lg:grid-cols-4"
          style={{ gap: 12, marginBottom: 28 }}
        >
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              style={{
                padding: 16,
                borderRadius: "var(--radius-lg)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
              }}
            >
              {/* Wraps, so a card's note opens on its own line under the label (InfoTip). */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  columnGap: 6,
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", minWidth: 0 }}>
                  {kpi.label}
                </span>
                {kpi.note && <InfoTip label={`How ${kpi.label} is counted`} note={kpi.note} />}
                <kpi.icon
                  aria-hidden="true"
                  style={{
                    width: 14,
                    height: 14,
                    color: "var(--text-tertiary)",
                    flexShrink: 0,
                    marginLeft: "auto",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-primary)",
                }}
              >
                {kpi.value}
              </div>
              {kpi.sub && (
                <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-tertiary)" }}>
                  {kpi.sub}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Sprint 9: Action Progress Tracker (Growth+), for the brand the switcher shows; with
            several brands and none selected, it asks which (no arbitrary "first brand", 7 Nov). */}
        {isGrowthPlus &&
          (switcherBrand ? (
            <ActionProgressTracker brandId={switcherBrand.id} />
          ) : (
            <AutopilotBrandPicker
              brands={pickerBrands}
              moreBrands={Math.max(0, brandCount - pickerBrands.length)}
            />
          ))}

        {/* Sprint 9: Health Check entry banner (Growth+), for the brand the switcher shows,
            until this person dismisses it. */}
        {bannerBrand && <HealthCheckBanner brandId={bannerBrand.id} brandName={bannerBrand.name} />}

        {/* Phase 2 §6U.5: Share of Voice, one line per brand */}
        <div style={{ marginBottom: 24 }}>
          <DashboardSovStrip
            lines={sovLines}
            moreBrands={Math.max(0, brandCount - sovLines.length)}
          />
        </div>

        {/* Recent audits feed card */}
        <div
          style={{
            borderRadius: "var(--radius-lg)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3
                style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}
              >
                Recent audits
              </h3>
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: 9999,
                  background: "var(--accent-muted)",
                  color: "var(--text-tertiary)",
                }}
              >
                {recentAudits.length}
              </span>
            </div>
            <Link
              href="/audits"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--text-secondary)",
                textDecoration: "none",
              }}
            >
              View all <ArrowRight style={{ width: 12, height: 12 }} />
            </Link>
          </div>

          {recentAudits.length === 0 ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                color: "var(--text-tertiary)",
                fontSize: 13,
              }}
            >
              No audits yet.
            </div>
          ) : (
            recentAudits.map((a, i) => {
              const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS.pending;
              const region = formatLocation((a.primaryRegions as string[])?.[0]);
              return (
                <Link
                  key={a.id}
                  href={`/audits/${a.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "14px 20px",
                    borderBottom:
                      i < recentAudits.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                      {a.brandName}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <MapPin style={{ width: 12, height: 12, color: "var(--text-tertiary)" }} />
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{region}</span>
                    </div>
                  </div>
                  <div style={{ minWidth: 72 }}>
                    <VisibilityCell display={a.visibility} />
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "2px 8px",
                      borderRadius: 9999,
                      background: sc.bg,
                      color: sc.color,
                    }}
                  >
                    {a.status}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      width: 64,
                      textAlign: "right",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true }).replace(
                      "about ",
                      "",
                    )}
                  </span>
                  <ChevronRight style={{ width: 14, height: 14, color: "var(--text-tertiary)" }} />
                </Link>
              );
            })
          )}
        </div>
        {/* Sprint 9: Persona-aware sections (Growth+) */}
        {/* The agency section is workspace-wide; the others are for the brand the switcher
            shows, and show nothing when none is selected (components/domain/autopilot/persona-dashboard.tsx). */}
        {isGrowthPlus && (
          <div style={{ marginTop: 24 }}>
            <PersonaDashboard
              brandId={switcherBrand?.id ?? null}
              brandName={switcherBrand?.name ?? ""}
              vertical={switcherBrand?.vertical ?? ""}
              tier={tier}
            />
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
