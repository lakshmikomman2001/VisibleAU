import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { SiteUnreachableNotice } from "@/components/domain/technical/site-unreachable-notice";
import { withRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { AI_TXT_PATHS } from "@/lib/ai-discovery/endpoints";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { CrawlSitemapOutcome } from "@/lib/crawler/types";
import { brandCrumb, CRUMB } from "@/lib/navigation/breadcrumbs";
import { getOrgTimezone } from "@/lib/platform/org-timezone";
import { measured, NOT_MEASURED } from "@/lib/scoring/measured";
import { type CrawlFindings, crawlReach } from "@/lib/technical-audit/crawl-status";
import { isUuid } from "@/lib/validation/uuid";
import { formatLocation } from "@/lib/verticals/expand-prompt";
import { LlmsTxtPreview } from "./llms-txt-preview";

interface LlmsTxtComponents {
  present: boolean;
  h1Blockquote: boolean;
  sections: boolean;
  links: boolean;
  depth: boolean;
  fullTxt: boolean;
}

interface LlmsTxtFindings {
  /** The llms.txt request's answer (17 Nov): "unreachable" is a timeout or a 5xx. Absent on older audits. */
  fetchStatus?: "found" | "absent" | "unreachable";
  present: boolean;
  url: string | null;
  depthScore: number;
  issues: string[];
  hasFullTxt: boolean;
  sizeKb: number;
  /** The real 6 per-component flags (task GG). Absent on audits run before
   * this was persisted -- never guess a breakdown from depthScore alone in
   * that case, the components are independent booleans, not a cumulative
   * sequence a single number can be reverse-engineered into. */
  components?: LlmsTxtComponents;
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

export interface LlmsTxtChecklistRow {
  label: string;
  pass: boolean;
  pts: number;
}

/**
 * Builds the "Current state" checklist from the real per-component flags
 * (task GG). Returns null when they're absent (a legacy audit run before
 * this was persisted) -- the components are 6 independent booleans, not a
 * cumulative sequence, so there is no honest way to derive them from the
 * summed score alone; the caller must show a fallback note instead of
 * fabricating rows.
 */
export function buildLlmsTxtChecklist(
  components: LlmsTxtComponents | undefined,
): LlmsTxtChecklistRow[] | null {
  if (!components) return null;
  return [
    { label: "llms.txt present", pass: components.present, pts: 3 },
    { label: "H1 + blockquote intro", pass: components.h1Blockquote, pts: 3 },
    { label: "Sections (## headings)", pass: components.sections, pts: 3 },
    { label: "Links to canonical pages", pass: components.links, pts: 3 },
    { label: "Content depth (≥1500 chars)", pass: components.depth, pts: 3 },
    { label: "llms-full.txt companion", pass: components.fullTxt, pts: 3 },
  ];
}

export interface DiscoveryCheckRow {
  label: string;
  /** "yes" found, "no" checked and not found, "unchecked" not checked (with why in `text`). */
  state: "yes" | "no" | "unchecked";
  text: string;
}

/**
 * The bonus discovery rows (17 Nov, part 3), each from what the audit stored. "Sitemap.xml present" read a
 * hard-coded "Yes · bonus"; the three AI files read `?? false`, so an audit with no AI-discovery result said
 * "Not found" for files nobody looked for.
 */
export function buildDiscoveryChecks(
  sitemap: CrawlSitemapOutcome | null | undefined,
  aiDiscovery: Partial<AiDiscoveryFindings> | undefined,
  siteUnreached: boolean,
): DiscoveryCheckRow[] {
  const unchecked = siteUnreached ? "Not checked: site not reached" : "Not checked on this audit";
  const sitemapRow: DiscoveryCheckRow = !sitemap
    ? { label: "Sitemap.xml present", state: "unchecked", text: unchecked }
    : sitemap.status === "found"
      ? { label: "Sitemap.xml present", state: "yes", text: "Yes · bonus" }
      : sitemap.status === "absent"
        ? { label: "Sitemap.xml present", state: "no", text: "Not found" }
        : { label: "Sitemap.xml present", state: "unchecked", text: "Couldn't check" };
  const aiRow = (label: string, found: boolean | undefined): DiscoveryCheckRow =>
    typeof found !== "boolean"
      ? { label, state: "unchecked", text: unchecked }
      : found
        ? { label, state: "yes", text: "Yes · bonus" }
        : { label, state: "no", text: "Not found" };
  return [
    sitemapRow,
    // Task FFF: label sourced from AI_TXT_PATHS, the same list the detector checks (either location) -- a
    // static ".well-known/ai.txt" label would mislabel a root /ai.txt file as "not found".
    aiRow(AI_TXT_PATHS.join(" or "), aiDiscovery?.aiTxtPresent),
    aiRow("/ai/summary.json", aiDiscovery?.aiSummaryPresent),
    aiRow("/ai/faq.json", aiDiscovery?.aiFaqPresent),
  ];
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

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const { brand, techAudit } = await withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId)).limit(1);
    if (!brand) notFound();

    const [techAudit] = await tx
      .select({
        findings: technicalAudits.findings,
        scoreLlmsTxt: technicalAudits.scoreLlmsTxt,
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
          crumbs={[
            CRUMB.workspace,
            CRUMB.brands,
            brandCrumb(brand),
            { label: "llms.txt generator" },
          ]}
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

  const allFindings = techAudit.findings as Record<string, unknown>;
  const findings = allFindings?.llmsTxt as LlmsTxtFindings | undefined;
  const aiDiscovery = allFindings?.aiDiscovery as AiDiscoveryFindings | undefined;
  const crawl = allFindings?.crawl as Partial<CrawlFindings> | undefined;
  // 17 Nov, part 3: on a crawl that never reached the site, or when the llms.txt request itself got no answer,
  // the file wasn't checked -- never "Not started" at 0 of 18.
  const reach = crawlReach(techAudit.findings);
  const siteUnreached = reach.kind === "unreached";
  const llmsUnchecked = siteUnreached || findings?.fetchStatus === "unreachable";
  const crawledOn = techAudit.crawledAt
    ? new Date(techAudit.crawledAt).toLocaleDateString("en-AU", {
        timeZone: getOrgTimezone(currentUser.organizationId),
      })
    : null;
  // 9 Nov (part 9): a missing depth score is "Not measured yet" -- no number and no "Not started" tier
  // badge (lib/scoring/measured.ts).
  const scoreM = measured(llmsUnchecked ? null : techAudit.scoreLlmsTxt);
  const score = scoreM.measured ? scoreM.value : null;
  const tier = score === null ? null : getDepthTier(score);
  const toneColors = tier === null ? null : TONE_COLORS[tier.tone];
  const notScoredText = llmsUnchecked ? "Couldn't check" : NOT_MEASURED;

  const components = llmsUnchecked ? null : buildLlmsTxtChecklist(findings?.components);

  const discoveryChecks = buildDiscoveryChecks(
    siteUnreached ? undefined : crawl?.sitemap,
    siteUnreached ? undefined : aiDiscovery,
    siteUnreached,
  );

  const regions = brand.primaryRegions
    .map((r: string) => formatLocation(r))
    .slice(0, 4)
    .join(", ");

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs
        crumbs={[CRUMB.workspace, CRUMB.brands, brandCrumb(brand), { label: "llms.txt generator" }]}
      />

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
        {score === null ? (
          <div style={{ fontSize: 14, color: "var(--text-tertiary)" }}>{notScoredText}</div>
        ) : (
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
        )}
      </div>

      {reach.kind === "unreached" && (
        <SiteUnreachableNotice
          domain={brand.domain}
          checkedOn={crawledOn}
          httpStatus={reach.httpStatus}
        />
      )}

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
                {score === null ? (
                  `depth score: ${notScoredText}`
                ) : (
                  <>depth score {score}/18 · graduated</>
                )}
              </div>
            </div>
            {tier && toneColors && (
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
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {components ? (
              components.map((c) => {
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
              })
            ) : llmsUnchecked ? (
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>
                {siteUnreached
                  ? "We couldn't reach your site on this audit, so your llms.txt wasn't checked."
                  : `We couldn't fetch https://${brand.domain}/llms.txt on this audit (no answer, or a server error), so it wasn't checked. That isn't the same as not having one.`}
              </p>
            ) : (
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>
                Per-component breakdown unavailable for this audit — re-run the audit to see it.
              </p>
            )}
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
                    color:
                      d.state === "yes"
                        ? "var(--success)"
                        : d.state === "no"
                          ? "var(--warning)"
                          : "var(--text-tertiary)",
                  }}
                >
                  {d.text}
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
