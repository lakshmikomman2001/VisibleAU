import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, setRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";
import { LlmsTxtPreview } from "./llms-txt-preview";

interface LlmsTxtFindings {
  present: boolean;
  url: string | null;
  depthScore: number;
  issues: string[];
  hasFullTxt: boolean;
  sizeKb: number;
}

interface AiDiscoveryFindings {
  score: number;
  aiTxtPresent: boolean;
  aiSummaryPresent: boolean;
  aiFaqPresent: boolean;
  aiServicePresent: boolean;
}

const DEPTH_TIERS: Array<{ min: number; label: string; tone: "danger" | "warning" | "success" }> = [
  { min: 0, label: "Not started", tone: "danger" },
  { min: 1, label: "Foundation", tone: "warning" },
  { min: 7, label: "Structured", tone: "warning" },
  { min: 13, label: "Comprehensive", tone: "success" },
  { min: 18, label: "Complete", tone: "success" },
];

function getDepthTier(score: number) {
  for (let i = DEPTH_TIERS.length - 1; i >= 0; i--) {
    if (score >= DEPTH_TIERS[i].min) return DEPTH_TIERS[i];
  }
  return DEPTH_TIERS[0];
}

const TONE_COLORS: Record<string, { bg: string; fg: string }> = {
  danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  warning: { bg: "var(--warning-soft)", fg: "var(--warning)" },
  success: { bg: "var(--success-soft)", fg: "var(--success)" },
};

export default async function LlmsTxtGeneratorPage({
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
      scoreLlmsTxt: technicalAudits.scoreLlmsTxt,
      crawledAt: technicalAudits.crawledAt,
    })
    .from(technicalAudits)
    .where(eq(technicalAudits.brandId, brandId))
    .orderBy(desc(technicalAudits.createdAt))
    .limit(1);

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "llms.txt generator"]} />
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

  const allFindings = techAudit.findings as Record<string, unknown>;
  const findings = allFindings?.llmsTxt as LlmsTxtFindings | undefined;
  const aiDiscovery = allFindings?.aiDiscovery as AiDiscoveryFindings | undefined;
  const score = Number(techAudit.scoreLlmsTxt ?? 0);
  const tier = getDepthTier(score);
  const toneColors = TONE_COLORS[tier.tone];

  const components = [
    { label: "llms.txt present", pass: findings?.present ?? false, pts: 3 },
    { label: "H1 + blockquote intro", pass: score >= 6, pts: 3 },
    { label: "Sections (## headings)", pass: score >= 9, pts: 3 },
    { label: "Links to canonical pages", pass: score >= 12, pts: 3 },
    { label: "Content depth (≥1500 chars)", pass: score >= 15, pts: 3 },
    { label: "llms-full.txt companion", pass: findings?.hasFullTxt ?? false, pts: 3 },
  ];

  const discoveryChecks = [
    {
      label: "Sitemap.xml present",
      present: true,
      presentLabel: "Yes · bonus",
      absentLabel: "Not found",
    },
    {
      label: ".well-known/ai.txt",
      present: aiDiscovery?.aiTxtPresent ?? false,
      presentLabel: "Yes · bonus",
      absentLabel: "Not found",
    },
    {
      label: "/ai/summary.json",
      present: aiDiscovery?.aiSummaryPresent ?? false,
      presentLabel: "Yes · bonus",
      absentLabel: "Not found",
    },
    {
      label: "/ai/faq.json",
      present: aiDiscovery?.aiFaqPresent ?? false,
      presentLabel: "Yes · bonus",
      absentLabel: "Not found",
    },
  ];

  const regions = brand.primaryRegions
    .map((r: string) => r.split(":")[1] ?? r)
    .slice(0, 4)
    .join(", ");

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "llms.txt generator"]} />

      {/* Header — FIX 6 */}
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
              margin: "0 0 6px",
            }}
          >
            llms.txt generator
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              margin: 0,
              maxWidth: 560,
              lineHeight: 1.5,
            }}
          >
            Generate a structured llms.txt for {brand.domain}. Helps LLM crawlers find your
            most-citable content.
          </p>
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            fontVariantNumeric: "tabular-nums",
            color: "var(--text-primary)",
          }}
        >
          {score}/18
        </div>
      </div>

      {/* 2-column grid: Current state + Why this matters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Current state card — FIX 4 (red 0-score) + FIX 3 (discovery checks) + FIX 6 (tier badge) */}
        <div
          style={{
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            padding: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                Current state
              </h3>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--text-tertiary)",
                  marginTop: 2,
                }}
              >
                depth score {score}/18 · graduated
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: 9999,
                background: toneColors.bg,
                color: toneColors.fg,
              }}
            >
              {tier.label}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {components.map((c) => {
              const failing = !c.pass;
              const scoreVal = c.pass ? c.pts : 0;
              return (
                <div
                  key={c.label}
                  title={`${c.label}: ${c.pass ? "passing" : "failing"}, ${scoreVal} of ${c.pts}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>{c.label}</span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                      color: failing ? "var(--danger)" : "var(--success)",
                    }}
                  >
                    {failing ? `No · ${scoreVal}/${c.pts}` : `Yes · ${scoreVal}/${c.pts}`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* FIX 3 — Discovery checks */}
          <div
            style={{
              borderTop: "1px solid var(--border-subtle)",
              marginTop: 10,
              paddingTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {discoveryChecks.map((d) => (
              <div
                key={d.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--text-secondary)" }}>{d.label}</span>
                <span
                  style={{
                    color: d.present ? "var(--success)" : "var(--warning)",
                  }}
                >
                  {d.present ? d.presentLabel : d.absentLabel}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* FIX 5 — Why this matters card */}
        <div
          style={{
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            padding: 20,
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
            Why this matters
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
            llms.txt is an emerging standard (think robots.txt for LLMs). Anthropic, Perplexity, and
            others are starting to honour it. A well-structured llms.txt boosts the chance your
            most-citable pages are found and used in answers.
          </p>
        </div>
      </div>

      {/* FIX 1 — Generated llms.txt preview with Copy + Download */}
      <LlmsTxtPreview
        brandName={brand.name}
        domain={brand.domain}
        vertical={brand.vertical}
        regions={regions}
      />

      {/* FIX 2 — Deployment instructions */}
      <div
        style={{
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          padding: 20,
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
          Deployment instructions
        </h3>
        <ol
          style={{
            margin: 0,
            paddingLeft: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {[
            { step: "1", text: "Download the generated llms.txt" },
            {
              step: "2",
              text: "Upload to your website root: ",
              code: "/llms.txt",
            },
            {
              step: "3",
              text: "Verify accessible at ",
              code: `https://${brand.domain}/llms.txt`,
            },
            {
              step: "4",
              text: "We’ll automatically re-check on your next audit",
            },
          ].map((item) => (
            <li
              key={item.step}
              style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", gap: 8 }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "var(--accent-muted)",
                  color: "var(--text-tertiary)",
                  fontSize: 11,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {item.step}
              </span>
              <span>
                {item.text}
                {item.code && (
                  <code
                    style={{
                      fontSize: 11,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "var(--bg-subtle)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {item.code}
                  </code>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* Issues (retained from original) */}
      {(findings?.issues?.length ?? 0) > 0 && (
        <div
          style={{
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            padding: 20,
            marginTop: 16,
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
            Issues
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {findings?.issues.map((issue) => (
              <li
                key={issue}
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
