import { addMonths, formatDistanceToNow, startOfMonth } from "date-fns";
import { and, count, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { Activity, ArrowRight, Building2, ChevronRight, MapPin, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, setRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DashboardShell } from "./dashboard-shell";

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: "var(--accent-muted)", color: "var(--text-secondary)" },
  running: { bg: "var(--info-soft)", color: "var(--info)" },
  complete: { bg: "var(--success-soft)", color: "var(--success)" },
  failed: { bg: "var(--danger-soft)", color: "var(--danger)" },
};

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const orgId = currentUser.organizationId;
  const firstName = (currentUser.name ?? "").split(" ")[0] || "there";

  const [{ count: brandCount }] = await db
    .select({ count: count() })
    .from(brands)
    .where(and(eq(brands.organizationId, orgId), isNull(brands.deletedAt)));

  if (brandCount === 0) redirect("/brands/wizard");

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = addMonths(monthStart, 1);

  const [auditsThisMonth, spendData, recentAudits, avgVis] = await Promise.all([
    db
      .select({ count: count() })
      .from(audits)
      .where(
        and(
          eq(audits.organizationId, orgId),
          gte(audits.createdAt, monthStart),
          lt(audits.createdAt, monthEnd),
        ),
      ),
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
        id: audits.id,
        brandName: brands.name,
        primaryRegions: brands.primaryRegions,
        scoreComposite: audits.scoreComposite,
        status: audits.status,
        createdAt: audits.createdAt,
      })
      .from(audits)
      .innerJoin(brands, eq(audits.brandId, brands.id))
      .where(eq(audits.organizationId, orgId))
      .orderBy(desc(audits.createdAt))
      .limit(5),
    db
      .select({
        avg: sql<string>`COALESCE(ROUND(AVG(score_composite::numeric), 1)::text, '')`,
      })
      .from(audits)
      .where(and(eq(audits.organizationId, orgId), eq(audits.status, "complete"))),
  ]);

  const auditCount = auditsThisMonth[0].count;
  const spendUsd = parseFloat(spendData[0].total || "0");
  const avgVisibility = avgVis[0]?.avg || "";

  const kpis = [
    { label: "Brands tracked", value: String(brandCount), icon: Building2, sub: null },
    { label: "Audits this month", value: String(auditCount), icon: Sparkles, sub: null },
    {
      label: "Avg visibility",
      value: avgVisibility || "—",
      icon: Activity,
      sub: avgVisibility ? "Across all completed audits" : "Run audits to see score",
    },
    {
      label: "LLM spend",
      value: `US$${spendUsd.toFixed(2)}`,
      icon: Zap,
      sub: `≈ A$${(spendUsd * 1.5).toFixed(2)} · ${auditCount} audits`,
    },
  ];

  const orgMeta = (currentUser.organization.metadata ?? {}) as Record<string, unknown>;
  const showTour = !orgMeta.productTourComplete;

  return (
    <DashboardShell showTour={showTour}>
    <div style={{ padding: "28px 32px" }}>
      {/* FIX 6: Welcome header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <div>
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
      <div
        data-tour="kpi-cards"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 28,
        }}
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
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{kpi.label}</span>
              <kpi.icon
                style={{ width: 14, height: 14, color: "var(--text-tertiary)", flexShrink: 0 }}
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
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
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
            const region = (a.primaryRegions as string[])?.[0] ?? "AU";
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
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{region.replace(":", " · ")}</span>
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    minWidth: 32,
                    textAlign: "right",
                  }}
                >
                  {a.scoreComposite ? parseFloat(a.scoreComposite).toFixed(1) : "—"}
                </span>
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
    </div>
    </DashboardShell>
  );
}
