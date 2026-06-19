import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, setRlsContext } from "@/db/client";
import { brandEntityScores, brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rollupTo5Categories } from "@/lib/technical-audit/score-aggregator";
import { isUuid } from "@/lib/validation/uuid";

const DIM_META = [
  {
    key: "scoreRobots",
    label: "Robots.txt",
    max: 18,
    desc: "AI crawler access configuration",
    route: "robots-txt-config",
  },
  {
    key: "scoreLlmsTxt",
    label: "llms.txt",
    max: 18,
    desc: "Structured AI content file",
    route: "llms-txt-generator",
  },
  {
    key: "scoreSchema",
    label: "Schema markup",
    max: 16,
    desc: "JSON-LD richness and completeness",
    route: "schema-audit",
  },
  {
    key: "scoreMeta",
    label: "Meta tags",
    max: 14,
    desc: "Title, description, OG, canonical, hreflang",
    route: null,
  },
  {
    key: "scoreContent",
    label: "Content quality",
    max: 12,
    desc: "SSR + answer capsule pattern",
    route: "ssr-check",
  },
  {
    key: "scoreBrandEntity",
    label: "Brand & Entity",
    max: 10,
    desc: "ABN, Wikipedia AU, directories",
    route: "brand-entity-audit",
  },
  {
    key: "scoreSignals",
    label: "Signals",
    max: 6,
    desc: "Negative signals + prompt injection",
    route: "signals",
  },
  {
    key: "scoreAiDiscovery",
    label: "AI Discovery",
    max: 6,
    desc: "AI endpoints presence",
    route: null,
  },
];

const CAT_META = [
  { key: "technicalPct", label: "Technical", desc: "Robots + llms.txt + AI Discovery + Signals" },
  { key: "contentPct", label: "Content", desc: "Content quality + Meta tags" },
  { key: "authorityPct", label: "Authority", desc: "Brand & Entity AU presence" },
  { key: "schemaPct", label: "Schema", desc: "JSON-LD markup richness" },
  { key: "performance", label: "Performance", desc: "Coming v1.1" },
];

export default async function TechnicalAuditPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) notFound();

  const recentAudits = await db
    .select()
    .from(technicalAudits)
    .where(eq(technicalAudits.brandId, brandId))
    .orderBy(desc(technicalAudits.createdAt))
    .limit(2);
  const techAudit = recentAudits[0];
  const prevAudit = recentAudits[1];

  const [_entityScore] = await db
    .select()
    .from(brandEntityScores)
    .where(eq(brandEntityScores.brandId, brandId))
    .orderBy(desc(brandEntityScores.checkedAt))
    .limit(1);

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Technical Audit"]} />
        <div
          style={{
            padding: 48,
            textAlign: "center",
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
            No technical audit yet. Run an audit to see results.
          </p>
        </div>
      </div>
    );
  }

  const rollup = rollupTo5Categories({
    scoreRobots: Number(techAudit.scoreRobots ?? 0),
    scoreLlmsTxt: Number(techAudit.scoreLlmsTxt ?? 0),
    scoreSchema: Number(techAudit.scoreSchema ?? 0),
    scoreMeta: Number(techAudit.scoreMeta ?? 0),
    scoreContent: Number(techAudit.scoreContent ?? 0),
    scoreBrandEntity: Number(techAudit.scoreBrandEntity ?? 0),
    scoreSignals: Number(techAudit.scoreSignals ?? 0),
    scoreAiDiscovery: Number(techAudit.scoreAiDiscovery ?? 0),
  });

  const latestScore = Number(techAudit.scoreComposite ?? 0);
  const prevScore = prevAudit ? Number(prevAudit.scoreComposite ?? 0) : null;
  const delta = prevScore !== null ? latestScore - prevScore : null;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Technical Audit"]} />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
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
              margin: "0 0 4px",
            }}
          >
            Technical AI Audit
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            {brand.name} &middot; 8 dimensions &middot;{" "}
            {techAudit.crawledAt
              ? `Crawled ${new Date(techAudit.crawledAt).toLocaleDateString()}`
              : ""}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-tertiary)",
            }}
          >
            Technical Score
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 600,
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              marginTop: 4,
            }}
          >
            {techAudit.scoreComposite ? Number(techAudit.scoreComposite).toFixed(0) : "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>of 100</div>
          {delta !== null && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginTop: 6,
                padding: "2px 8px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 500,
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                background:
                  delta === 0
                    ? "var(--bg-hover)"
                    : delta > 0
                      ? "var(--success-soft)"
                      : "var(--danger-soft)",
                color:
                  delta === 0
                    ? "var(--text-tertiary)"
                    : delta > 0
                      ? "var(--success)"
                      : "var(--danger)",
              }}
            >
              {delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} vs last`}
            </div>
          )}
        </div>
      </div>

      {/* 5-Category Rollup */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 32,
        }}
      >
        {CAT_META.map((cat) => {
          const val =
            cat.key === "performance"
              ? null
              : (rollup as unknown as Record<string, number | null>)[cat.key];
          return (
            <div
              key={cat.key}
              style={{
                padding: 16,
                borderRadius: 8,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
                {cat.label}
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color:
                    val === null
                      ? "var(--text-disabled)"
                      : val >= 60
                        ? "var(--success)"
                        : val >= 30
                          ? "var(--warning)"
                          : "var(--danger)",
                  marginBottom: 2,
                }}
              >
                {val !== null ? `${val}%` : "—"}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{cat.desc}</div>
            </div>
          );
        })}
      </div>

      {/* 8-Dimension Drill-Down */}
      <div
        style={{
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            8-Dimension Breakdown
          </h3>
        </div>
        {DIM_META.map((dim) => {
          const raw = Number((techAudit as Record<string, unknown>)[dim.key] ?? 0);
          const pct = dim.max > 0 ? Math.round((raw / dim.max) * 100) : 0;
          const bandColor =
            pct >= 60 ? "var(--success)" : pct >= 30 ? "var(--warning)" : "var(--danger)";
          const isCritical = pct < 30;
          const severityLabel = isCritical
            ? "critical"
            : pct < 30
              ? "low"
              : pct < 60
                ? "moderate"
                : "good";
          const rowContent = (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {dim.label}
                  {isCritical && (
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--danger)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{dim.desc}</div>
              </div>
              <div style={{ width: 120 }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 9999,
                    overflow: "hidden",
                    background: "var(--accent-muted)",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 9999,
                      minWidth: pct === 0 ? 5 : undefined,
                      width: `${pct}%`,
                      background: bandColor,
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  width: 60,
                  textAlign: "right",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: isCritical ? "var(--danger)" : "var(--text-primary)",
                }}
              >
                {raw}/{dim.max}
              </div>
            </>
          );
          const rowStyle: React.CSSProperties = {
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-subtle)",
          };
          if (dim.route) {
            return (
              <Link
                key={dim.key}
                href={`/brands/${brandId}/${dim.route}`}
                aria-label={`${dim.label}: ${raw} of ${dim.max} — ${severityLabel}`}
                style={{ ...rowStyle, textDecoration: "none", cursor: "pointer" }}
              >
                {rowContent}
              </Link>
            );
          }
          return (
            <section
              key={dim.key}
              aria-label={`${dim.label}: ${raw} of ${dim.max} — ${severityLabel}`}
              style={rowStyle}
            >
              {rowContent}
            </section>
          );
        })}
      </div>
    </div>
  );
}
