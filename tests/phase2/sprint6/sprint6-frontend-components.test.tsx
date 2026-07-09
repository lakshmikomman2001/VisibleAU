// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/brands/test/retrieval",
  useParams: () => ({ brandId: "brand_test_1" }),
}));

// ═══════════════════════════════════════════════════════════════
// 1 — RetrievalScoreSummary (3 hub stats, NO standalone depth card)
// ═══════════════════════════════════════════════════════════════

describe("RetrievalScoreSummary", () => {
  async function renderSummary(props: {
    agentReadiness: number | null;
    avgCitationProbability: number;
    crawlerVisitCount: number;
  }) {
    const { RetrievalScoreSummary } = await import(
      "@/components/domain/retrieval/retrieval-score-summary"
    );
    return render(React.createElement(RetrievalScoreSummary, props));
  }

  it("renders 3 stat cards with correct values", async () => {
    await renderSummary({
      agentReadiness: 72,
      avgCitationProbability: 0.55,
      crawlerVisitCount: 14,
    });
    expect(screen.getByText("72/100")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("Agent Readiness")).toBeInTheDocument();
    expect(screen.getByText("Avg Citation Prob.")).toBeInTheDocument();
    expect(screen.getByText("Crawler Visits")).toBeInTheDocument();
  });

  it("agentReadiness=null renders '—/100'", async () => {
    await renderSummary({
      agentReadiness: null,
      avgCitationProbability: 0,
      crawlerVisitCount: 0,
    });
    expect(screen.getByText("—/100")).toBeInTheDocument();
  });

  it("does NOT render standalone llms.txt depth card (guard 1)", async () => {
    const { container } = await renderSummary({
      agentReadiness: 50,
      avgCitationProbability: 0.3,
      crawlerVisitCount: 5,
    });
    expect(container.textContent).not.toContain("llms.txt");
    expect(container.textContent).not.toContain("/18");
    expect(container.textContent).not.toContain("Depth");
  });
});

// ═══════════════════════════════════════════════════════════════
// 2 — AgentReadinessCard (5 dimensions + sub-signals + gaps)
// ═══════════════════════════════════════════════════════════════

describe("AgentReadinessCard", () => {
  const BASE_PROPS = {
    totalScore: 65,
    techScore: 16,
    entityClarityScore: 14,
    verifyScore: 12,
    authorityScore: 11,
    taskScore: 12,
    localAiTrustScore: null,
    gaps: ["Add FAQ schema to service pages"],
    llmstxtDepthScore: 12,
    mcpEndpointPresent: false,
  };

  async function renderCard(overrides: Record<string, unknown> = {}) {
    const { AgentReadinessCard } = await import(
      "@/components/domain/retrieval/agent-readiness-card"
    );
    return render(
      React.createElement(AgentReadinessCard, { ...BASE_PROPS, ...overrides }),
    );
  }

  it("renders total score", async () => {
    await renderCard();
    expect(screen.getByText("65/100")).toBeInTheDocument();
  });

  it("renders all 5 dimension labels with /20 values", async () => {
    const { container } = await renderCard();
    expect(screen.getByText("Technical")).toBeInTheDocument();
    expect(screen.getByText("Entity Clarity")).toBeInTheDocument();
    expect(screen.getByText("Verifiability")).toBeInTheDocument();
    expect(screen.getByText("Authority")).toBeInTheDocument();
    expect(screen.getByText("Task-Fit")).toBeInTheDocument();
    const dimValues = container.querySelectorAll(".text-sm.font-semibold");
    const texts = Array.from(dimValues).map((el) => el.textContent);
    expect(texts).toContain("16/20");
    expect(texts).toContain("14/20");
    expect(texts).toContain("11/20");
    expect(texts.filter((t) => t === "12/20")).toHaveLength(2);
  });

  it("renders Technical sub-signals (llms.txt depth + MCP)", async () => {
    await renderCard();
    expect(screen.getByText("Technical sub-signals")).toBeInTheDocument();
    expect(screen.getByText("llms.txt depth: 12/18")).toBeInTheDocument();
    expect(screen.getByText("MCP: absent")).toBeInTheDocument();
  });

  it("MCP detected when mcpEndpointPresent=true", async () => {
    await renderCard({ mcpEndpointPresent: true });
    expect(screen.getByText("MCP: detected")).toBeInTheDocument();
  });

  it("renders gaps list", async () => {
    await renderCard();
    expect(screen.getByText("Top Gaps")).toBeInTheDocument();
    expect(
      screen.getByText("Add FAQ schema to service pages"),
    ).toBeInTheDocument();
  });

  it("all-null scores render 0/100", async () => {
    await renderCard({
      totalScore: null,
      techScore: null,
      entityClarityScore: null,
      verifyScore: null,
      authorityScore: null,
      taskScore: null,
      gaps: [],
      llmstxtDepthScore: undefined,
      mcpEndpointPresent: undefined,
    });
    expect(screen.getByText("0/100")).toBeInTheDocument();
    expect(screen.queryByText("Top Gaps")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Technical sub-signals"),
    ).not.toBeInTheDocument();
  });

  it("low score (15) gets destructive color", async () => {
    const { container } = await renderCard({ totalScore: 15 });
    const scoreEl = screen.getByText("15/100");
    expect(scoreEl.style.color).toBe("var(--destructive)");
  });

  it("high score (75) gets success color", async () => {
    await renderCard({ totalScore: 75 });
    const scoreEl = screen.getByText("75/100");
    expect(scoreEl.style.color).toBe("var(--success)");
  });

  it("mid score (50) gets warning color", async () => {
    await renderCard({ totalScore: 50 });
    const scoreEl = screen.getByText("50/100");
    expect(scoreEl.style.color).toBe("var(--warning)");
  });

  it("localAiTrustScore shown when present", async () => {
    await renderCard({ localAiTrustScore: 68 });
    expect(screen.getByText("68/100")).toBeInTheDocument();
    expect(screen.getByText(/Local AI Trust/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// 3 — EntityHomeCard (guard 2 — @id/sameAs/org-schema, NOT content-structure)
// ═══════════════════════════════════════════════════════════════

describe("EntityHomeCard", () => {
  async function renderCard(
    entityHomeStatus: {
      orgSchemaPresent: boolean;
      idFieldPresent: boolean;
      sameAsCount: number;
      pageUrl: string | null;
    } | null,
  ) {
    const { EntityHomeCard } = await import(
      "@/components/domain/retrieval/entity-home-card"
    );
    return render(React.createElement(EntityHomeCard, { entityHomeStatus }));
  }

  it("null → empty state with audit prompt", async () => {
    await renderCard(null);
    expect(screen.getByText("Not identified")).toBeInTheDocument();
    expect(
      screen.getByText(/haven.t identified your Entity Home/),
    ).toBeInTheDocument();
  });

  it("complete status → 'Complete' badge + all 3 fields", async () => {
    const { container } = await renderCard({
      orgSchemaPresent: true,
      idFieldPresent: true,
      sameAsCount: 4,
      pageUrl: "https://example.com/about",
    });
    expect(screen.getByText("Complete")).toBeInTheDocument();
    const presentEls = screen.getAllByText("present");
    expect(presentEls.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("4/3 required")).toBeInTheDocument();
    expect(container.textContent).toContain("@id:");
    expect(container.textContent).toContain("Organisation schema:");
    expect(container.textContent).toContain("sameAs count:");
  });

  it("incomplete status → 'Incomplete' badge + gaps", async () => {
    await renderCard({
      orgSchemaPresent: false,
      idFieldPresent: false,
      sameAsCount: 1,
      pageUrl: "https://example.com/about",
    });
    expect(screen.getByText("Incomplete")).toBeInTheDocument();
    expect(
      screen.getByText("Missing Organisation JSON-LD on Entity Home page."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("@id field not pointing to canonical domain."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Only 1 sameAs declarations/),
    ).toBeInTheDocument();
  });

  it("does NOT render content-structure fields (guard 2 — Bug B)", async () => {
    const { container } = await renderCard({
      orgSchemaPresent: true,
      idFieldPresent: true,
      sameAsCount: 3,
      pageUrl: "https://example.com/about",
    });
    expect(container.textContent).not.toContain("Citation");
    expect(container.textContent).not.toContain("Capsule");
    expect(container.textContent).not.toContain("Format");
    expect(container.textContent).not.toContain("Word");
  });
});

// ═══════════════════════════════════════════════════════════════
// 4 — ContentStructureCard (citation bands + freshness + inline fields)
// ═══════════════════════════════════════════════════════════════

describe("ContentStructureCard", () => {
  const BASE_AUDIT = {
    id: "audit_1",
    pageUrl: "https://example.com/services",
    answerCapsuleScore: 3,
    faqBlockPresent: true,
    faqSchemaPresent: false,
    wordCount: 1200,
    optimalPassageCount: 4,
    freshnessRisk: "fresh" as string | null,
    contentFormatDetected: "listicle" as string | null,
    citationProbabilityScore: "0.72" as string | null,
    hasAuthorAttribution: true,
    auditedAt: "2026-07-07T00:00:00Z",
  };

  async function renderCard(overrides: Partial<typeof BASE_AUDIT> = {}) {
    const { ContentStructureCard } = await import(
      "@/components/domain/retrieval/content-structure-card"
    );
    return render(
      React.createElement(ContentStructureCard, {
        audit: { ...BASE_AUDIT, ...overrides },
      }),
    );
  }

  it("renders page URL, format, word count", async () => {
    await renderCard();
    expect(
      screen.getByText("https://example.com/services"),
    ).toBeInTheDocument();
    expect(screen.getByText(/listicle/)).toBeInTheDocument();
    expect(screen.getByText(/1200 words/)).toBeInTheDocument();
  });

  it("capsule + passages rendered", async () => {
    await renderCard();
    expect(screen.getByText("Capsule: 3/4")).toBeInTheDocument();
    expect(screen.getByText("Passages: 4")).toBeInTheDocument();
  });

  it("FAQ Block badge shown when faqBlockPresent=true", async () => {
    await renderCard();
    expect(screen.getByText("FAQ Block")).toBeInTheDocument();
  });

  it("Author badge shown when hasAuthorAttribution=true", async () => {
    await renderCard();
    expect(screen.getByText("Author")).toBeInTheDocument();
  });

  it("citation prob 0.72 → success (green) color", async () => {
    await renderCard({ citationProbabilityScore: "0.72" });
    const pctEl = screen.getByText("72%");
    expect(pctEl.style.color).toBe("var(--success)");
  });

  it("citation prob 0.45 → warning (amber) color", async () => {
    await renderCard({ citationProbabilityScore: "0.45" });
    const pctEl = screen.getByText("45%");
    expect(pctEl.style.color).toBe("var(--warning)");
  });

  it("citation prob 0.22 → destructive (red) color", async () => {
    await renderCard({ citationProbabilityScore: "0.22" });
    const pctEl = screen.getByText("22%");
    expect(pctEl.style.color).toBe("var(--destructive)");
  });

  it("boundary: 0.70 exactly → success (green)", async () => {
    await renderCard({ citationProbabilityScore: "0.70" });
    const pctEl = screen.getByText("70%");
    expect(pctEl.style.color).toBe("var(--success)");
  });

  it("boundary: 0.40 exactly → warning (amber)", async () => {
    await renderCard({ citationProbabilityScore: "0.40" });
    const pctEl = screen.getByText("40%");
    expect(pctEl.style.color).toBe("var(--warning)");
  });

  it("boundary: 0.39 → destructive (red)", async () => {
    await renderCard({ citationProbabilityScore: "0.39" });
    const pctEl = screen.getByText("39%");
    expect(pctEl.style.color).toBe("var(--destructive)");
  });

  it("freshness badge: 'fresh' renders with success color", async () => {
    await renderCard({ freshnessRisk: "fresh" });
    const badge = screen.getByText("fresh");
    expect(badge.style.color).toBe("var(--success)");
  });

  it("freshness badge: 'aging' renders with warning color", async () => {
    await renderCard({ freshnessRisk: "aging" });
    const badge = screen.getByText("aging");
    expect(badge.style.color).toBe("var(--warning)");
  });

  it("freshness badge: 'at_risk' renders with destructive color", async () => {
    await renderCard({ freshnessRisk: "at_risk" });
    const badge = screen.getByText("at_risk");
    expect(badge.style.color).toBe("var(--destructive)");
  });

  it("freshness badge: 'stale' renders with destructive color", async () => {
    await renderCard({ freshnessRisk: "stale" });
    const badge = screen.getByText("stale");
    expect(badge.style.color).toBe("var(--destructive)");
  });
});

// ═══════════════════════════════════════════════════════════════
// 5 — CrawlerLogTable (rows + empty state)
// ═══════════════════════════════════════════════════════════════

describe("CrawlerLogTable", () => {
  async function renderTable(
    logs: Array<{
      id: string;
      crawlerName: string | null;
      crawlerTier: string | null;
      visitedUrl: string;
      statusCode: number | null;
      isActiveAgent: boolean | null;
      visitPurpose: string | null;
      visitedAt: string;
    }>,
  ) {
    const { CrawlerLogTable } = await import(
      "@/components/domain/retrieval/crawler-log-table"
    );
    return render(React.createElement(CrawlerLogTable, { logs }));
  }

  it("empty → install snippet prompt", async () => {
    await renderTable([]);
    expect(
      screen.getByText(
        /No crawler visits recorded yet\. Install the tracking snippet/,
      ),
    ).toBeInTheDocument();
  });

  it("renders rows with crawler name + tier + URL + status + purpose", async () => {
    await renderTable([
      {
        id: "1",
        crawlerName: "GPTBot",
        crawlerTier: "must_allow",
        visitedUrl: "https://example.com/services",
        statusCode: 200,
        isActiveAgent: false,
        visitPurpose: "indexing",
        visitedAt: "2026-07-07T12:00:00Z",
      },
    ]);
    expect(screen.getByText("GPTBot")).toBeInTheDocument();
    expect(screen.getByText("must_allow")).toBeInTheDocument();
    expect(
      screen.getByText("https://example.com/services"),
    ).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("indexing")).toBeInTheDocument();
  });

  it("active agent shows (Active) marker", async () => {
    await renderTable([
      {
        id: "2",
        crawlerName: "ChatGPT-User",
        crawlerTier: "must_allow",
        visitedUrl: "https://example.com/",
        statusCode: 200,
        isActiveAgent: true,
        visitPurpose: "citation_check",
        visitedAt: "2026-07-07T12:00:00Z",
      },
    ]);
    expect(screen.getByText("(Active)")).toBeInTheDocument();
  });

  it("null crawlerName shows 'Unknown'", async () => {
    await renderTable([
      {
        id: "3",
        crawlerName: null,
        crawlerTier: null,
        visitedUrl: "https://example.com/x",
        statusCode: null,
        isActiveAgent: false,
        visitPurpose: null,
        visitedAt: "2026-07-07T12:00:00Z",
      },
    ]);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("status 200 gets success color, non-200 gets destructive", async () => {
    await renderTable([
      {
        id: "4",
        crawlerName: "GPTBot",
        crawlerTier: "must_allow",
        visitedUrl: "https://example.com/a",
        statusCode: 200,
        isActiveAgent: false,
        visitPurpose: null,
        visitedAt: "2026-07-07T12:00:00Z",
      },
      {
        id: "5",
        crawlerName: "ClaudeBot",
        crawlerTier: "must_allow",
        visitedUrl: "https://example.com/b",
        statusCode: 403,
        isActiveAgent: false,
        visitPurpose: null,
        visitedAt: "2026-07-07T12:00:00Z",
      },
    ]);
    const status200 = screen.getByText("200");
    const status403 = screen.getByText("403");
    expect(status200.style.color).toBe("var(--success)");
    expect(status403.style.color).toBe("var(--destructive)");
  });
});

// ═══════════════════════════════════════════════════════════════
// 6 — CdnBlockAlert (renders alert when blocked, component-level)
// ═══════════════════════════════════════════════════════════════

describe("CdnBlockAlert", () => {
  async function renderAlert(props: {
    detectedFirewall: string;
    remediationSnippet: string;
    brandDomain: string;
  }) {
    const { CdnBlockAlert } = await import(
      "@/components/domain/retrieval/cdn-block-alert"
    );
    return render(React.createElement(CdnBlockAlert, props));
  }

  it("renders 'AI Crawler Access Blocked' heading", async () => {
    await renderAlert({
      detectedFirewall: "Cloudflare",
      remediationSnippet: "Allow GPTBot in <brand domain> WAF rules",
      brandDomain: "example.com",
    });
    expect(
      screen.getByText("AI Crawler Access Blocked"),
    ).toBeInTheDocument();
  });

  it("shows firewall name in description", async () => {
    await renderAlert({
      detectedFirewall: "Cloudflare",
      remediationSnippet: "snippet here",
      brandDomain: "example.com",
    });
    expect(
      screen.getByText(
        /Cloudflare is blocking AI search engines from reading your site/,
      ),
    ).toBeInTheDocument();
  });

  it("remediation snippet replaces <brand domain> with actual domain", async () => {
    await renderAlert({
      detectedFirewall: "Cloudflare",
      remediationSnippet:
        "Allow GPTBot in <brand domain> WAF rules for <brand domain>",
      brandDomain: "metro.com.au",
    });
    expect(
      screen.getByText(
        /Allow GPTBot in metro\.com\.au WAF rules for metro\.com\.au/,
      ),
    ).toBeInTheDocument();
  });

  it("Copy Fix button is present", async () => {
    await renderAlert({
      detectedFirewall: "Cloudflare",
      remediationSnippet: "snippet",
      brandDomain: "example.com",
    });
    expect(
      screen.getByRole("button", { name: /copy remediation snippet/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Copy Fix")).toBeInTheDocument();
  });

  it("has role=alert for accessibility", async () => {
    await renderAlert({
      detectedFirewall: "Vercel",
      remediationSnippet: "snippet",
      brandDomain: "example.com",
    });
    expect(
      screen.getByRole("alert", { name: /AI Crawler Access Blocked/i }),
    ).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// 7 — LlmstxtViewer (content + depth + empty state)
// ═══════════════════════════════════════════════════════════════

describe("LlmstxtViewer", () => {
  const CURRENT_VERSION = {
    id: "v1",
    content: "# llms.txt\nUser-agent: *\nAllow: /",
    depthScore: 14,
    isCurrent: true,
    hostedUrl: "https://example.com/llms.txt",
    generatedAt: "2026-07-05T00:00:00Z",
  };

  async function renderViewer(
    current: typeof CURRENT_VERSION | null,
    history: Array<typeof CURRENT_VERSION> = current ? [current] : [],
  ) {
    const { LlmstxtViewer } = await import(
      "@/components/domain/retrieval/llmstxt-viewer"
    );
    return render(
      React.createElement(LlmstxtViewer, {
        current,
        history,
        brandId: "brand_test_1",
        onRefresh: vi.fn(),
      }),
    );
  }

  it("current=null → empty state message", async () => {
    await renderViewer(null);
    expect(
      screen.getByText(/No llms\.txt generated yet/),
    ).toBeInTheDocument();
  });

  it("with current → shows content + depth /18", async () => {
    const { container } = await renderViewer(CURRENT_VERSION);
    const pre = container.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(pre!.textContent).toContain("# llms.txt");
    expect(pre!.textContent).toContain("User-agent: *");
    expect(screen.getByText(/Depth: 14\/18/)).toBeInTheDocument();
  });

  it("Generate New button present and enabled", async () => {
    await renderViewer(null);
    const btn = screen.getByRole("button", { name: /generate new/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("version history shown when >1 versions", async () => {
    const older = {
      ...CURRENT_VERSION,
      id: "v0",
      isCurrent: false,
      depthScore: 8,
      generatedAt: "2026-07-01T00:00:00Z",
    };
    await renderViewer(CURRENT_VERSION, [CURRENT_VERSION, older]);
    expect(screen.getByText("Version history (2)")).toBeInTheDocument();
  });

  it("version history NOT shown with only 1 version", async () => {
    await renderViewer(CURRENT_VERSION, [CURRENT_VERSION]);
    expect(screen.queryByText(/Version history/)).not.toBeInTheDocument();
  });
});
