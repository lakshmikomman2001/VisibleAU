import { desc, eq } from "drizzle-orm";
import { AlertCircle, ExternalLink } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, setRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SCHEMA_REALITY_CHECK } from "@/lib/schema-audit/reality-check";
import { isUuid } from "@/lib/validation/uuid";

interface ValidatedBlock {
  type: string;
  attributeCount: number;
  hasEntityLinking: boolean;
  richness: number;
  status: "valid" | "warning" | "danger";
  issues: string[];
  detail: string;
}

interface SchemaFindings {
  typesFound: string[];
  richness: number;
  gaps: string[];
  realityCheck: Record<string, string>;
  blocks?: ValidatedBlock[];
}

const SCORED_TYPES = ["Organization", "LocalBusiness", "FAQPage", "Article"];

const ENGINE_LABELS: Record<string, string> = {
  google: "Google",
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

const STATUS_TONES: Record<string, { bg: string; fg: string; label: string }> = {
  valid: { bg: "var(--success-soft)", fg: "var(--success)", label: "valid" },
  warning: { bg: "var(--warning-soft)", fg: "var(--warning)", label: "warning" },
  danger: { bg: "var(--danger-soft)", fg: "var(--danger)", label: "danger" },
};

export default async function SchemaAuditPage({
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

  const [techAudit] = await db
    .select({
      findings: technicalAudits.findings,
      scoreSchema: technicalAudits.scoreSchema,
      crawledAt: technicalAudits.crawledAt,
    })
    .from(technicalAudits)
    .where(eq(technicalAudits.brandId, brandId))
    .orderBy(desc(technicalAudits.createdAt))
    .limit(1);

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Schema audit"]} />
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
  const score = Number(techAudit.scoreSchema ?? 0);
  const blocks = findings?.blocks ?? [];

  const totalSchemas = blocks.length || (findings?.typesFound?.length ?? 0);
  const validCount = blocks.filter((b) => b.status === "valid").length;
  const warningCount = blocks.filter((b) => b.status === "warning").length;
  const dangerCount = blocks.filter((b) => b.status === "danger").length;
  const maxRichness = SCORED_TYPES.length * 4;

  const scoreColor =
    score === 0 ? "var(--danger)" : score <= 6 ? "var(--warning)" : "var(--text-primary)";

  const kpiCards = [
    { label: "Total schemas", value: String(totalSchemas), tone: "neutral" as const },
    { label: "Valid", value: String(validCount), tone: "success" as const },
    { label: "Warnings", value: String(warningCount), tone: "warning" as const },
    { label: "Hallucinated", value: String(dangerCount), tone: "danger" as const },
    {
      label: "Schema richness",
      value: `${score}/${maxRichness}`,
      tone: (score === 0 ? "danger" : score < maxRichness / 2 ? "warning" : "success") as
        | "danger"
        | "warning"
        | "success",
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
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Schema audit"]} />

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
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 2px" }}>
            Found and validated against schema.org. Reality-checked against your actual website
            content.
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
            {findings?.typesFound?.length ?? 0} schema types found · Score: {score}/16
          </p>
        </div>
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
      </div>

      {/* FIX 3 — KPI stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
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
          {blocks.map((block) => {
            const tone = STATUS_TONES[block.status];
            return (
              <section
                key={`${block.type}-${block.attributeCount}`}
                aria-label={`${block.type} schema: ${block.status}`}
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
                            color: block.status === "danger" ? "var(--danger)" : "var(--warning)",
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
          const found = findings?.typesFound?.some((t) => t.includes(type)) ?? false;
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
      {(findings?.gaps?.length ?? 0) > 0 && (
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
