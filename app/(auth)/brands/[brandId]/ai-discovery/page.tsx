import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { withRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { AI_DISCOVERY_WEIGHTS, AI_TXT_PATHS, type AiDiscoveryFindings } from "@/lib/ai-discovery/endpoints";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";

// Task WW: weights come from the scorer (lib/ai-discovery/endpoints.ts) --
// do not re-hardcode a second copy here, that's how this page's weights
// drifted to 2/2/1/1 against the real 3/1/1/1.
// Task FFF: the ai.txt path(s) come from the same AI_TXT_PATHS the
// detector checks, for the same reason -- the old hardcoded "/ai.txt" copy
// didn't match what was actually fetched (/.well-known/ai.txt only), so a
// customer following the on-screen instructions would still score 0.
// Task GGG: per-row provenance tag, copy/display only -- no score change.
// Only ai.txt has independent external grounding (the June 2026 IETF draft
// draft-car-ai-txt-wellknown); the three JSON endpoints trace only to the
// Auriti-Labs reference project the PRD's own v1.11 changelog flags as
// untrustworthy (self-authored scoring rubric, zero third-party review,
// all-mocked test suite). Labelling them "Vunnara-recommended" rather than
// implying an industry standard is the same unearned-authority fix as the
// methodology work (tasks MM/NN), applied here.
const ENDPOINTS = [
  {
    key: "aiTxtPresent",
    label: "ai.txt",
    weight: AI_DISCOVERY_WEIGHTS.aiTxt,
    desc: `Machine-readable AI policy file at ${AI_TXT_PATHS.join(" or ")}`,
    provenance: "Emerging standard · IETF draft",
  },
  {
    key: "aiFaqPresent",
    label: "AI FAQ / Help Content",
    weight: AI_DISCOVERY_WEIGHTS.aiFaq,
    desc: "Dedicated FAQ or help page mentioning AI assistants",
    provenance: "Vunnara-recommended format",
  },
  {
    key: "aiSummaryPresent",
    label: "AI-Ready Summary",
    weight: AI_DISCOVERY_WEIGHTS.aiSummary,
    desc: "Concise business summary optimised for AI extraction",
    provenance: "Vunnara-recommended format",
  },
  {
    key: "aiServicePresent",
    label: "AI Service Endpoint",
    weight: AI_DISCOVERY_WEIGHTS.aiService,
    desc: "Structured API or feed for AI consumption",
    provenance: "Vunnara-recommended format",
  },
] as const;

export default async function AiDiscoveryPage({
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
        scoreAiDiscovery: technicalAudits.scoreAiDiscovery,
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
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "AI Discovery"]} />
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

  const findings = (techAudit.findings as Record<string, unknown>)?.aiDiscovery as
    | AiDiscoveryFindings
    | undefined;
  const score = Number(techAudit.scoreAiDiscovery ?? 0);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "AI Discovery"]} />

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
            AI Discovery Audit
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            AI endpoint presence &amp; discoverability &middot; Score: {score}/6
          </p>
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            color: "var(--text-primary)",
          }}
        >
          {score}/6
        </div>
      </div>

      {/* Task GGG: pairs the score with the honest framing so a 0/6 reads
          as "nothing added yet", not "you failed a norm" -- scoring is
          unchanged, this is copy only. */}
      <p
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          margin: "0 0 16px",
          lineHeight: 1.5,
        }}
      >
        These are <strong>emerging</strong>{" "}
        AI-discovery endpoints — most sites don&apos;t have them yet. Adding them is a
        forward-looking best practice, not a fix for a standards violation.
      </p>

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
            AI Endpoints
          </h3>
        </div>
        {ENDPOINTS.map((ep) => {
          const present = findings?.[ep.key] ?? false;
          return (
            <div
              key={ep.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 20px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <span
                style={{
                  fontSize: 16,
                  color: present ? "var(--success)" : "var(--text-tertiary)",
                }}
              >
                {present ? "✓" : "✗"}
              </span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                  }}
                >
                  {ep.label}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      color: "var(--text-tertiary)",
                      background: "var(--bg-subtle)",
                      borderRadius: 9999,
                      padding: "1px 8px",
                    }}
                  >
                    {ep.provenance}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{ep.desc}</div>
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  color: present ? "var(--success)" : "var(--text-tertiary)",
                }}
              >
                {present ? ep.weight : 0}/{ep.weight}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
