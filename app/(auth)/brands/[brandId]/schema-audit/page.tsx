import { desc, eq } from "drizzle-orm";
import { AlertCircle, ExternalLink } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { SiteUnreachableNotice } from "@/components/domain/technical/site-unreachable-notice";
import { withRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { brandCrumb, CRUMB } from "@/lib/navigation/breadcrumbs";
import { getOrgTimezone } from "@/lib/platform/org-timezone";
import { SCHEMA_REALITY_CHECK } from "@/lib/schema-audit/reality-check";
import { measured, NOT_MEASURED, scoreText } from "@/lib/scoring/measured";
import { crawlReach } from "@/lib/technical-audit/crawl-status";
import { isUuid } from "@/lib/validation/uuid";

interface ValidatedBlock {
  type: string;
  attributeCount: number;
  hasEntityLinking: boolean;
  richness: number;
  status: "valid" | "warning" | "danger";
  issues: string[];
  detail: string;
  /** Pages this exact block was on (17 Nov). Absent on older audits, which listed it once per page. */
  pageCount?: number;
}

interface SchemaFindings {
  typesFound?: string[];
  richness: number;
  gaps?: string[];
  realityCheck: Record<string, string>;
  blocks?: ValidatedBlock[];
  pagesScanned?: number;
}

export interface SchemaKpis {
  /** "Distinct schema blocks" on an audit that stored distinct blocks; older ones counted a block per page. */
  blocksLabel: string;
  blocks: number | null;
  valid: number | null;
  toReview: number | null;
  typesFound: number | null;
}

/**
 * 17 Nov, part 3: the schema page's counts, from what the audit stored. There is no "Hallucinated" count: it
 * was every FAQPage with questions (lib/schema-audit/validate-blocks.ts), and nothing compares a block with the
 * page's text. An older audit's "danger" blocks are that FAQ reminder, so they count as "to review". A count
 * the audit didn't store is null (not measured), never 0.
 */
export function schemaKpis(findings: SchemaFindings | undefined): SchemaKpis {
  const blocks = findings?.blocks;
  const distinct = Array.isArray(blocks) && blocks.every((b) => typeof b.pageCount === "number");
  return {
    blocksLabel: distinct ? "Distinct schema blocks" : "Blocks found (counted per page)",
    blocks: Array.isArray(blocks) ? blocks.length : null,
    valid: Array.isArray(blocks) ? blocks.filter((b) => b.status === "valid").length : null,
    toReview: Array.isArray(blocks) ? blocks.filter((b) => b.status !== "valid").length : null,
    typesFound: Array.isArray(findings?.typesFound) ? findings.typesFound.length : null,
  };
}

const SCORED_TYPES = ["Organization", "LocalBusiness", "FAQPage", "Article"];

const ENGINE_LABELS: Record<string, string> = {
  google: "Google",
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

// 17 Nov, part 3: "danger" on an older audit was only the FAQ "check each question" reminder, so it reads as
// one: a warning to review, not a red finding.
const STATUS_TONES: Record<string, { bg: string; fg: string; label: string }> = {
  valid: { bg: "var(--success-soft)", fg: "var(--success)", label: "valid" },
  warning: { bg: "var(--warning-soft)", fg: "var(--warning)", label: "to review" },
  danger: { bg: "var(--warning-soft)", fg: "var(--warning)", label: "to review" },
};

export default async function SchemaAuditPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const { brand, techAudit } = await withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId)).limit(1);
    if (!brand) notFound();

    const [techAudit] = await tx
      .select({
        findings: technicalAudits.findings,
        scoreSchema: technicalAudits.scoreSchema,
        crawledAt: technicalAudits.crawledAt,
      })
      .from(technicalAudits)
      .where(eq(technicalAudits.brandId, brandId))
      .orderBy(desc(technicalAudits.createdAt))
      .limit(1);

    return { brand, techAudit };
  });

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs
          crumbs={[CRUMB.workspace, CRUMB.brands, brandCrumb(brand), { label: "Schema audit" }]}
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
            Run a technical audit first.
          </p>
        </div>
      </div>
    );
  }

  const findings = (techAudit.findings as Record<string, unknown>)?.schema as
    | SchemaFindings
    | undefined;
  // 17 Nov, part 3: a crawl that never reached the site read no pages, so it found no schema -- "Not checked",
  // never 0 of 16 and every type "Missing".
  const reach = crawlReach(techAudit.findings);
  const unreached = reach.kind === "unreached";
  const crawledOn = techAudit.crawledAt
    ? new Date(techAudit.crawledAt).toLocaleDateString("en-AU", {
        timeZone: getOrgTimezone(currentUser.organizationId),
      })
    : null;
  // 9 Nov (part 9): a missing sub-score is "Not measured yet" -- no number, no red 0/16
  // (lib/scoring/measured.ts).
  const scoreM = measured(unreached ? null : techAudit.scoreSchema);
  const score = scoreM.measured ? scoreM.value : null;
  const blocks = unreached ? [] : (findings?.blocks ?? []);
  const kpis = unreached ? null : schemaKpis(findings);
  const notScoredText = unreached ? "Not checked" : NOT_MEASURED;
  const count = (n: number | null | undefined) =>
    n === null || n === undefined ? notScoredText : String(n);
  const maxRichness = SCORED_TYPES.length * 4;

  const scoreColor =
    score === 0
      ? "var(--danger)"
      : score !== null && score <= 6
        ? "var(--warning)"
        : "var(--text-primary)";

  const kpiCards = [
    {
      label: kpis?.blocksLabel ?? "Schema blocks",
      value: count(kpis?.blocks),
      tone: "neutral" as const,
    },
    { label: "Valid", value: count(kpis?.valid), tone: "success" as const },
    { label: "To review", value: count(kpis?.toReview), tone: "warning" as const },
    {
      label: "Schema richness",
      value: unreached ? notScoredText : scoreText(score, maxRichness),
      tone: (score === null
        ? "neutral"
        : score === 0
          ? "danger"
          : score < maxRichness / 2
            ? "warning"
            : "success") as "neutral" | "danger" | "warning" | "success",
    },
  ];

  const KPI_TONE_COLORS: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: "var(--bg-subtle)", fg: "var(--text-secondary)" },
    success: { bg: "var(--success-soft)", fg: "var(--success)" },
    warning: { bg: "var(--warning-soft)", fg: "var(--warning)" },
    danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs
        crumbs={[CRUMB.workspace, CRUMB.brands, brandCrumb(brand), { label: "Schema audit" }]}
      />

      {/* FIX 2 — Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: "0 0 4px",
            }}
          >
            Schema markup audit
          </h1>
          {/* 17 Nov, part 3: it said "Found and validated against schema.org. Reality-checked against your
              actual website content." Nothing validates against schema.org or reads the page's text. */}
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 2px" }}>
            The JSON-LD on the pages we crawled
            {typeof findings?.pagesScanned === "number" && !unreached
              ? ` (${findings.pagesScanned} ${findings.pagesScanned === 1 ? "page" : "pages"})`
              : ""}
            , and how complete each block is. We don&apos;t check it against your pages&apos; text.
          </p>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              margin: 0,
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {kpis === null || kpis.typesFound === null
              ? `Schema types: ${notScoredText}`
              : `${kpis.typesFound} schema types found`}{" "}
            · Score: {score === null ? notScoredText : <>{score}/16</>}
            {crawledOn ? ` · Crawled ${crawledOn}` : ""}
          </p>
        </div>
        {score === null ? (
          <div style={{ fontSize: 14, color: "var(--text-tertiary)" }}>{notScoredText}</div>
        ) : (
          <div
            style={{
              fontSize: 36,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              color: scoreColor,
            }}
          >
            {score}/16
          </div>
        )}
      </div>

      {reach.kind === "unreached" && (
        <SiteUnreachableNotice
          domain={brand.domain}
          checkedOn={crawledOn}
          httpStatus={reach.httpStatus}
        />
      )}

      {/* FIX 3 — KPI stat cards: four across from 1024px, two on a phone */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 12, marginBottom: 24 }}>
        {kpiCards.map((kpi) => {
          const tone = KPI_TONE_COLORS[kpi.tone];
          return (
            <div
              key={kpi.label}
              style={{
                padding: 16,
                borderRadius: 8,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-tertiary)",
                  marginBottom: 6,
                }}
              >
                {kpi.label}
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  padding: "2px 10px",
                  borderRadius: 9999,
                  background: tone.bg,
                  color: tone.fg,
                }}
              >
                {kpi.value}
              </span>
            </div>
          );
        })}
      </div>

      {/* FIX 3 — Per-schema detail cards (populated state) */}
      {blocks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {blocks.map((block, idx) => {
            const tone = STATUS_TONES[block.status];
            return (
              <section
                key={`${block.type}-${idx}`}
                aria-label={`${block.type} schema: ${tone.label}`}
                style={{
                  padding: 20,
                  borderRadius: 8,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    marginBottom: block.detail || block.issues.length > 0 ? 10 : 0,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 9999,
                        background: tone.bg,
                        color: tone.fg,
                      }}
                    >
                      {tone.label}
                    </span>
                    <h3
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        margin: 0,
                      }}
                    >
                      {block.type}
                    </h3>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      richness {block.richness}/4 · {block.attributeCount} attrs
                      {typeof block.pageCount === "number"
                        ? ` · on ${block.pageCount} ${block.pageCount === 1 ? "page" : "pages"}`
                        : ""}
                    </span>
                  </div>
                  <a
                    href={`https://schema.org/${block.type}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                      textDecoration: "none",
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--border-default)",
                    }}
                  >
                    <ExternalLink style={{ width: 12, height: 12 }} />
                    View source
                  </a>
                </div>

                {block.detail && (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>
                    {block.detail}
                  </p>
                )}

                {block.issues.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      marginTop: block.detail ? 4 : 0,
                    }}
                  >
                    {block.issues.map((issue) => (
                      <div
                        key={issue}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          fontSize: 13,
                          color: "var(--text-secondary)",
                        }}
                      >
                        <AlertCircle
                          style={{
                            width: 14,
                            height: 14,
                            marginTop: 2,
                            flexShrink: 0,
                            color: "var(--warning)",
                          }}
                        />
                        <span>{issue}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* FIX 1 — Scored schema types with danger colouring for missing */}
      <div
        style={{
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Schema Types (4 scored)
          </h3>
        </div>
        {SCORED_TYPES.map((type) => {
          // Not found only when the audit read the pages and stored what it found.
          const typesFound = unreached ? undefined : findings?.typesFound;
          const checked = Array.isArray(typesFound);
          const found = checked && typesFound.some((t) => t.includes(type));
          if (!checked) {
            return (
              <section
                key={type}
                aria-label={`${type} schema: not checked`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>{type}</span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Not checked</span>
              </section>
            );
          }
          return (
            <section
              key={type}
              aria-label={`${type} schema: ${found ? "found" : "missing"}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 20px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <span
                style={{
                  fontSize: 16,
                  color: found ? "var(--success)" : "var(--danger)",
                }}
              >
                {found ? "✓" : "✗"}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>{type}</span>
              <span
                style={{
                  fontSize: 12,
                  color: found ? "var(--success)" : "var(--danger)",
                }}
              >
                {found ? "Found" : "Missing"}
              </span>
            </section>
          );
        })}
      </div>

      {/* Gaps — Missing Schema Types */}
      {!unreached && (findings?.gaps?.length ?? 0) > 0 && (
        <div
          style={{
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: "0 0 12px",
            }}
          >
            Missing Schema Types
          </h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {findings?.gaps?.map((gap) => (
              <span
                key={gap}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  fontSize: 12,
                  background: "var(--warning-soft)",
                  color: "var(--warning)",
                }}
              >
                {gap}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reality Check — Impact by Engine */}
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
            Reality Check — Impact by Engine
          </h3>
        </div>
        {Object.entries(SCHEMA_REALITY_CHECK).map(([engine, text]) => (
          <div
            key={engine}
            style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-primary)",
                marginBottom: 2,
              }}
            >
              {ENGINE_LABELS[engine] ?? engine}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
