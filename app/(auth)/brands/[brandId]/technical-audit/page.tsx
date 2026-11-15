import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { SiteUnreachableNotice } from "@/components/domain/technical/site-unreachable-notice";
import { withRlsContext } from "@/db/client";
import { brandEntityScores, brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { brandCrumb, CRUMB } from "@/lib/navigation/breadcrumbs";
import { getOrgTimezone } from "@/lib/platform/org-timezone";
import { measured, NOT_MEASURED } from "@/lib/scoring/measured";
import { crawlReach, isSiteDependentDimension } from "@/lib/technical-audit/crawl-status";
import {
  comparableCompositeDelta,
  rollupTo5Categories,
  TECHNICAL_AUDIT_MAX_SCORE,
} from "@/lib/technical-audit/score-aggregator";
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
    route: "meta-tags",
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
    // Vunnara (21 Oct, "directory listings... never scraping", Part A3):
    // was 10 -- the directory signal is removed from this score
    // entirely (lib/brand-entity/score.ts), not just hidden.
    max: 8,
    desc: "ABN, Wikipedia AU",
    route: "brand-entity-audit",
  },
  {
    key: "scoreSignals",
    label: "Signals",
    max: 6,
    // 17 Nov, part 3: the score is lib/negative-signals aggregateNegativeScore alone; prompt injection is listed
    // on the Signals page but never changes it. It said "Negative signals + prompt injection".
    desc: "Negative signals (prompt injection is listed, not scored)",
    route: "signals",
  },
  {
    key: "scoreAiDiscovery",
    label: "AI Discovery",
    max: 6,
    desc: "AI endpoints presence",
    route: "ai-discovery",
    // Task GGG: label only -- the 6-point contribution to the composite
    // is unchanged. 3 of its 4 signals trace only to a reference project
    // the PRD flags as untrustworthy; see ai-discovery/page.tsx.
    emerging: true,
  },
];

const CAT_META = [
  { key: "technicalPct", label: "Technical", desc: "Robots + llms.txt + AI Discovery + Signals" },
  { key: "contentPct", label: "Content", desc: "Content quality + Meta tags" },
  { key: "authorityPct", label: "Authority", desc: "Brand & Entity AU presence" },
  { key: "schemaPct", label: "Schema", desc: "JSON-LD markup richness" },
];

export default async function TechnicalAuditPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const { brand, techAudit, prevAudit } = await withRlsContext(
    currentUser.organizationId,
    async (tx) => {
      const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId)).limit(1);
      if (!brand) notFound();

      const recentAudits = await tx
        .select()
        .from(technicalAudits)
        .where(eq(technicalAudits.brandId, brandId))
        .orderBy(desc(technicalAudits.createdAt))
        .limit(2);
      const techAudit = recentAudits[0];
      const prevAudit = recentAudits[1];

      const [_entityScore] = await tx
        .select()
        .from(brandEntityScores)
        .where(eq(brandEntityScores.brandId, brandId))
        .orderBy(desc(brandEntityScores.checkedAt))
        .limit(1);

      return { brand, techAudit, prevAudit };
    },
  );

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs
          crumbs={[CRUMB.workspace, CRUMB.brands, brandCrumb(brand), { label: "Technical Audit" }]}
        />
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

  // 17 Nov, part 3: a crawl that never reached the site (lib/technical-audit/crawl-status.ts) has no score for
  // the checks that needed it, even on a row stored before the writer stopped saving its zeros.
  const reach = crawlReach(techAudit.findings);
  const unreached = reach.kind === "unreached";
  const timeZone = getOrgTimezone(currentUser.organizationId);
  const dayOf = (d: Date | string) =>
    new Date(d).toLocaleDateString("en-AU", { timeZone, day: "numeric", month: "short" });
  const crawledOn = techAudit.crawledAt
    ? new Date(techAudit.crawledAt).toLocaleDateString("en-AU", { timeZone })
    : null;
  const findingStatus = (section: "robots" | "llmsTxt"): unknown => {
    const all = techAudit.findings as Record<string, unknown> | null;
    const part = all?.[section] as Record<string, unknown> | undefined;
    return part?.fetchStatus;
  };
  // Leftovers task, part 3: llms.txt read but its llms-full.txt companion couldn't be checked; an AI-discovery
  // file that couldn't be checked; the ABN or Wikipedia lookup that didn't complete. Each leaves its score
  // unmeasured ("Couldn't check"), never a 0 for the part nobody could see.
  const allFindings = (techAudit.findings ?? {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const llmsFullUnchecked =
    allFindings.llmsTxt?.fetchStatus === "found" &&
    allFindings.llmsTxt?.fullFetchStatus === "unreachable";
  const aiDiscoveryUnchecked =
    Object.keys((allFindings.aiDiscovery?.notChecked as Record<string, string> | undefined) ?? {})
      .length > 0;
  const entityLookupFailed =
    allFindings.brandEntity?.abnStatus === "check_failed" ||
    allFindings.brandEntity?.wikipediaAuStatus === "unavailable";
  const storedDim = (key: string): string | null => {
    if (unreached && isSiteDependentDimension(key)) return null;
    return (techAudit as Record<string, unknown>)[key] as string | null;
  };

  // 9 Nov (part 9): a sub-score that wasn't measured is "Not measured yet", never 0 (lib/scoring/measured.ts).
  // It enters the rollup as NaN, so a category it feeds comes out not measured too -- never a percentage
  // built from a 0 nobody scored.
  const dimOrNaN = (key: string): number => {
    const m = measured(storedDim(key));
    return m.measured ? m.value : Number.NaN;
  };
  const rollup = rollupTo5Categories({
    scoreRobots: dimOrNaN("scoreRobots"),
    scoreLlmsTxt: dimOrNaN("scoreLlmsTxt"),
    scoreSchema: dimOrNaN("scoreSchema"),
    scoreMeta: dimOrNaN("scoreMeta"),
    scoreContent: dimOrNaN("scoreContent"),
    scoreBrandEntity: dimOrNaN("scoreBrandEntity"),
    scoreSignals: dimOrNaN("scoreSignals"),
    scoreAiDiscovery: dimOrNaN("scoreAiDiscovery"),
  });

  // A missing composite (this audit's or the previous one's) gives no comparison, never a change from 0. 17 Nov,
  // part 3: nor does a crawl that never reached the site, or a previous audit on the old /100 scale; the change
  // says the date of the audit it compares with ("+3.0 vs 2 Nov").
  const latest = unreached ? measured(null) : measured(techAudit.scoreComposite);
  const prev = prevAudit ? measured(prevAudit.scoreComposite) : null;
  const delta =
    prevAudit && latest.measured && prev?.measured
      ? comparableCompositeDelta(
          {
            composite: latest.value,
            createdAt: techAudit.createdAt,
            siteReached: !unreached,
          },
          {
            composite: prev.value,
            createdAt: prevAudit.createdAt,
            siteReached: crawlReach(prevAudit.findings).kind !== "unreached",
          },
        )
      : null;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs
        crumbs={[CRUMB.workspace, CRUMB.brands, brandCrumb(brand), { label: "Technical Audit" }]}
      />

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
            {crawledOn
              ? // "Dates show in Sydney time" (23 Oct), item 3
                `Crawled ${crawledOn}`
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
          {latest.measured ? (
            <>
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
                {latest.value.toFixed(0)}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                of {TECHNICAL_AUDIT_MAX_SCORE}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 4 }}>
              {unreached ? "Not checked" : NOT_MEASURED}
            </div>
          )}
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
              {prevAudit &&
                (delta === 0
                  ? `No change since ${dayOf(prevAudit.createdAt)}`
                  : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} vs ${dayOf(prevAudit.createdAt)}`)}
            </div>
          )}
        </div>
      </div>

      {reach.kind === "unreached" && (
        <SiteUnreachableNotice
          domain={brand.domain}
          checkedOn={crawledOn}
          httpStatus={reach.httpStatus}
        />
      )}

      {/* Category rollup: four across from 1024px, two on a phone. 17 Nov, part 2: no "Performance -- Coming
          v1.1" tile (nothing measures it). */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 12, marginBottom: 32 }}>
        {CAT_META.map((cat) => {
          const catM = measured((rollup as unknown as Record<string, number | null>)[cat.key]);
          const val = catM?.measured ? catM.value : null;
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
              {val === null ? (
                <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 2 }}>
                  {NOT_MEASURED}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                    color:
                      val >= 60 ? "var(--success)" : val >= 30 ? "var(--warning)" : "var(--danger)",
                    marginBottom: 2,
                  }}
                >
                  {`${val}%`}
                </div>
              )}
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
          // A check whose own request got no answer (robots.txt or llms.txt, from 17 Nov) has no score either.
          const requestFailed =
            (dim.key === "scoreRobots" && findingStatus("robots") === "unreachable") ||
            (dim.key === "scoreLlmsTxt" &&
              (findingStatus("llmsTxt") === "unreachable" || llmsFullUnchecked)) ||
            (dim.key === "scoreAiDiscovery" && aiDiscoveryUnchecked) ||
            (dim.key === "scoreBrandEntity" && entityLookupFailed);
          const notChecked = (unreached && isSiteDependentDimension(dim.key)) || requestFailed;
          const m = measured(storedDim(dim.key));
          const raw = m.measured ? m.value : null;
          const pct = raw === null ? null : dim.max > 0 ? Math.round((raw / dim.max) * 100) : 0;
          const bandColor =
            pct === null
              ? "var(--text-tertiary)"
              : pct >= 60
                ? "var(--success)"
                : pct >= 30
                  ? "var(--warning)"
                  : "var(--danger)";
          const isCritical = pct !== null && pct < 30;
          const notScoredText = requestFailed
            ? "Couldn't check"
            : notChecked
              ? "Not checked"
              : NOT_MEASURED;
          const severityLabel = isCritical
            ? "critical"
            : pct === null
              ? notScoredText.toLowerCase()
              : pct < 30
                ? "low"
                : pct < 60
                  ? "moderate"
                  : "good";
          const ariaLabel =
            raw === null
              ? `${dim.label}: ${severityLabel}`
              : `${dim.label}: ${raw} of ${dim.max} — ${severityLabel}`;
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
                  {"emerging" in dim && dim.emerging && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 500,
                        color: "var(--text-tertiary)",
                        background: "var(--bg-subtle)",
                        borderRadius: 9999,
                        padding: "1px 6px",
                        textTransform: "lowercase",
                      }}
                    >
                      emerging
                    </span>
                  )}
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
              {pct === null ? (
                // Not measured: no bar and no number -- the text takes the bar's and the number's room.
                <div
                  style={{
                    width: 196,
                    textAlign: "right",
                    fontSize: 12,
                    color: bandColor,
                  }}
                >
                  {notScoredText}
                </div>
              ) : (
                <>
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
              )}
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
                aria-label={ariaLabel}
                style={{ ...rowStyle, textDecoration: "none", cursor: "pointer" }}
              >
                {rowContent}
              </Link>
            );
          }
          return (
            <section key={dim.key} aria-label={ariaLabel} style={rowStyle}>
              {rowContent}
            </section>
          );
        })}
      </div>
    </div>
  );
}
