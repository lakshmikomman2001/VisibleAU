// @vitest-environment jsdom
/**
 * 17 Nov, part 3 -- the retrieval pages' figures, rendered with the shapes the API returns.
 * - Agent readiness: scored out of the points measured, with the unmeasured parts named; the llms.txt number is
 *   VisibleAU's own draft, and says so.
 * - Retrieval hub: "Crawler Visits" is a count over a stated period (it was a 10-row list's length), and the
 *   citation average says how many pages it's over and that it's our estimate.
 * - Content structure: "Capsule" is out of 100 (it read "N/4" for a 0-100 value); a page with no Last-Modified
 *   date is "no date", not a red "stale"; a missing word count isn't "0 words".
 * - Crawler logs: a visit with no status recorded is neutral, not red.
 * - Entity home: the date the verdict is from.
 * - llms.txt page: "Draft coverage", not "Depth" with the generator page's /18.
 */
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { AgentReadinessCard } from "@/components/domain/retrieval/agent-readiness-card";
import {
  ContentStructureCard,
  freshnessBadge,
} from "@/components/domain/retrieval/content-structure-card";
import { CrawlerLogTable, statusColor } from "@/components/domain/retrieval/crawler-log-table";
import { EntityHomeCard } from "@/components/domain/retrieval/entity-home-card";
import { LlmstxtViewer } from "@/components/domain/retrieval/llmstxt-viewer";
import { RetrievalScoreSummary } from "@/components/domain/retrieval/retrieval-score-summary";
import {
  readinessFromStoredRow,
  type StoredReadinessParts,
} from "@/lib/retrieval/agent-readiness-breakdown";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/brands/b/retrieval",
  useParams: () => ({ brandId: "b" }),
}));

const LEGACY_ROW: StoredReadinessParts = {
  techLlmstxtPresent: false,
  techLlmstxtValid: false,
  techRobotsAllowsCrawlers: true,
  techSsrPasses: true,
  techAiDiscoveryEndpoints: true,
  techPageLoadFast: true,
  techMcpEndpointPresent: false,
  techMcpEndpointValid: false,
  entityOrgSchemaPresent: false,
  entityLocalBusinessSchema: true,
  entityLocalRegInSchema: false,
  entityNameConsistent: true,
  entityServiceReadable: true,
  verifyAbnConfirmed: true,
  verifyWikipediaAu: false,
  verifyAuDirectories: 0,
  verifyReviewCitations: 0,
  verifyExpertQuotes: false,
  authorityTopicalCoverage: 60,
  authorityPromptAppearance: 0,
  authorityCitationDiversity: 0,
  taskBookingAccessible: false,
  taskPricingVisible: true,
  taskServiceAreaDefined: true,
  taskFaqDirectAnswers: 2,
};

// The first jsdom render here can be slow (tests/unit: 5 s limit); warm the components up first.
beforeAll(() => {
  render(
    <RetrievalScoreSummary
      agentReadiness={null}
      avgCitationProbability={null}
      crawlerVisitCount={0}
    />,
  );
}, 30_000);

describe("AgentReadinessCard with the stored row's parts", () => {
  it("the total is out of the points measured, not /100 with the old writer's free points", () => {
    // The old writer stored totalScore 43 for this row: 37 measured + 6 free (page speed 2, name consistency 4).
    render(
      <AgentReadinessCard
        totalScore={43}
        techScore={10}
        entityClarityScore={11}
        verifyScore={5}
        authorityScore={5}
        taskScore={12}
        localAiTrustScore={null}
        gaps={["No llms.txt file detected — generate and host one."]}
        llmstxtDepthScore={12}
        mcpEndpointPresent={false}
        breakdown={readinessFromStoredRow(LEGACY_ROW)}
      />,
    );
    expect(screen.getByText("37/67")).toBeInTheDocument();
    expect(screen.queryByText("43/100")).not.toBeInTheDocument();
    expect(screen.getByText("8/18")).toBeInTheDocument(); // Technical
    expect(
      screen.getByText(/Out of the 67 points we could measure\. 33 of the 100 points/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/page load speed \(2\), name consistent across the web \(4\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("llms.txt draft coverage (ours, not your site's file): 12/18"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No llms.txt draft generated in VisibleAU yet: generate one, then host it on your site.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No llms\.txt file detected/)).not.toBeInTheDocument();
  });

  it("a row with no measured part at all reads 'Not measured yet', not 0", () => {
    const empty = Object.fromEntries(
      Object.keys(LEGACY_ROW).map((k) => [k, null]),
    ) as unknown as StoredReadinessParts;
    render(
      <AgentReadinessCard
        totalScore={56}
        techScore={14}
        entityClarityScore={16}
        verifyScore={8}
        authorityScore={5}
        taskScore={13}
        localAiTrustScore={null}
        gaps={[]}
        breakdown={readinessFromStoredRow(empty)}
      />,
    );
    expect(screen.getAllByText("Not measured yet").length).toBeGreaterThan(0);
    expect(screen.queryByText("56/100")).not.toBeInTheDocument();
  });
});

describe("RetrievalScoreSummary says what each figure is over", () => {
  it("crawler visits over a stated period, citation average over N pages as our estimate, readiness of the points measured", () => {
    const { container } = render(
      <RetrievalScoreSummary
        agentReadiness={37}
        agentReadinessMax={67}
        avgCitationProbability={0.42}
        citationPagesScored={14}
        crawlerVisitCount={213}
        crawlerVisitDays={30}
      />,
    );
    expect(screen.getByText("213")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByText("Our estimate, across 14 pages")).toBeInTheDocument();
    expect(screen.getByText("37/67")).toBeInTheDocument();
    expect(screen.getByText("Out of the points we could measure")).toBeInTheDocument();
    expect(container.textContent).not.toContain("/18");
  });

  it("the hub route counts visits over the period and averages every page's latest check", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/brands/[brandId]/retrieval-audit/route.ts", "utf8");
    expect(src).not.toMatch(/\.limit\(10\)/);
    expect(src).not.toMatch(/\.limit\(5\)/);
    expect(src).toMatch(/select\(\{ total: count\(\) \}\)/);
    expect(src).toMatch(/gte\(crawlerVisitLogs\.visitedAt, since\)/);
    expect(src).toMatch(/readinessFromStoredRow\(latestReadiness\)\.total/);
  });
});

describe("ContentStructureCard", () => {
  const AUDIT = {
    id: "a1",
    pageUrl: "https://acme.com.au/services",
    answerCapsuleScore: 70,
    faqBlockPresent: true,
    faqSchemaPresent: false,
    wordCount: null,
    optimalPassageCount: 3,
    freshnessRisk: "stale",
    contentFormatDetected: "how_to_guide",
    citationProbabilityScore: "0.51",
    hasAuthorAttribution: false,
    auditedAt: "2026-11-12T00:00:00Z",
    // The page sent no Last-Modified: the auditor stored "stale" by default.
    lastModified: null,
    daysSincePublished: null,
  };

  it("capsule out of 100, 'no date' for a page with no Last-Modified, a missing word count not 0", () => {
    const { container } = render(<ContentStructureCard audit={AUDIT} />);
    expect(screen.getByText("Capsule: 70/100")).toBeInTheDocument();
    const badge = screen.getByText("no date");
    expect(badge.style.color).toBe("var(--text-secondary)");
    expect(screen.queryByText("stale")).not.toBeInTheDocument();
    expect(container.textContent).toContain("word count not measured");
    expect(container.textContent).not.toContain("0 words");
    expect(screen.getByText("Citation estimate")).toBeInTheDocument();
  });

  it("a page with a real date keeps its freshness verdict", () => {
    expect(
      freshnessBadge({
        freshnessRisk: "stale",
        lastModified: "2026-01-01T00:00:00Z",
        daysSincePublished: 300,
      }),
    ).toEqual({ label: "stale", color: "var(--danger)" });
  });

  it("the content structure page calls the percentage our estimate", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "app/(auth)/brands/[brandId]/retrieval/content-structure/page.tsx",
      "utf8",
    );
    expect(src).toContain("Our estimate from the page&apos;s structure, not a measured rate.");
  });
});

describe("CrawlerLogTable status colours", () => {
  it("no status recorded is neutral; 2xx green; 4xx/5xx red; a redirect neutral", () => {
    expect(statusColor(null)).toBe("var(--text-secondary)");
    expect(statusColor(200)).toBe("var(--success)");
    expect(statusColor(204)).toBe("var(--success)");
    expect(statusColor(301)).toBe("var(--text-secondary)");
    expect(statusColor(404)).toBe("var(--danger)");
    expect(statusColor(503)).toBe("var(--danger)");
  });

  it("renders the dash for no status in the neutral colour", () => {
    render(
      <CrawlerLogTable
        logs={[
          {
            id: "1",
            crawlerName: "GPTBot",
            crawlerTier: "must_allow",
            visitedUrl: "https://acme.com.au/",
            statusCode: null,
            isActiveAgent: false,
            visitPurpose: null,
            visitedAt: "2026-11-12T00:00:00Z",
          },
        ]}
      />,
    );
    const dashes = screen.getAllByText("—");
    expect(dashes[0].style.color).toBe("var(--text-secondary)");
  });
});

describe("EntityHomeCard shows the date its verdict is from", () => {
  it("'Page last checked' with the row's date", () => {
    render(
      <EntityHomeCard
        entityHomeStatus={{
          orgSchemaPresent: true,
          idFieldPresent: false,
          sameAsCount: 1,
          pageUrl: "https://acme.com.au/about",
          checkedAt: "2026-11-02T00:00:00Z",
        }}
      />,
    );
    expect(screen.getByText(/^Page last checked /)).toBeInTheDocument();
  });
});

describe("LlmstxtViewer labels our draft's score distinctly", () => {
  it("'Draft coverage', not 'Depth'", () => {
    const v = {
      id: "v1",
      content: "# Acme",
      depthScore: 9,
      isCurrent: true,
      hostedUrl: null,
      generatedAt: "2026-11-01T00:00:00Z",
    };
    const { container } = render(
      <LlmstxtViewer current={v} history={[v]} brandId="b" onRefresh={vi.fn()} />,
    );
    expect(container.textContent).toMatch(
      /Draft coverage: 9\/18 \(our draft, not your site's\s+file\)/,
    );
    expect(container.textContent).not.toMatch(/Depth: 9\/18/);
  });
});
