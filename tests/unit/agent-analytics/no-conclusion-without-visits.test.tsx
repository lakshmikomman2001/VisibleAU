// @vitest-environment jsdom
/**
 * 17 Nov, part 3 -- Agent Analytics draws no conclusion its data can't support:
 * - "Pages AI has never seen" listed every sitemap page when no crawler visit was on record at all.
 * - A page fetched by a "retrieval" bot was badged "Cited in AI answers"; a crawler fetch is not a citation (the
 *   audit page measures citations), and the purpose is our bot list's default, not observed.
 * - The "Tier" column read `crawlerTier` while the SQL returned `crawler_tier`: always blank.
 */
import { readFileSync } from "node:fs";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AgentAnalyticsPagesCoverage,
  crawlerVisitsRecorded,
} from "@/components/domain/retrieval/agent-analytics-pages-coverage";
import { connectionState } from "@/components/domain/retrieval/agent-analytics-setup-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useParams: () => ({ brandId: "b" }),
  usePathname: () => "/brands/b/retrieval/agent-analytics",
}));

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function stubCoverage(coverage: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ coverage }),
  }) as unknown as typeof fetch;
}

const SITEMAP = [
  "https://acme.com.au/",
  "https://acme.com.au/services",
  "https://acme.com.au/about",
];

beforeAll(async () => {
  stubCoverage({
    gap: { sitemapUrls: [], crawledUrls: [], gaps: [], coveragePercent: 0 },
    topRetrieval: [],
    topIndexing: [],
    periodStart: "2026-10-16",
    periodEnd: "2026-11-15",
    visitsInPeriod: 0,
  });
  const { container } = render(<AgentAnalyticsPagesCoverage brandId="b" />);
  await waitFor(() => expect(container.textContent).toContain("Pages AI has never seen"), {
    timeout: 20_000,
  });
}, 30_000);

describe("Pages AI has never seen -- only with visits on record", () => {
  it("no visit recorded in the period: no page is listed as never seen, and no task is offered", async () => {
    stubCoverage({
      gap: { sitemapUrls: SITEMAP, crawledUrls: [], gaps: SITEMAP, coveragePercent: 0 },
      topRetrieval: [],
      topIndexing: [],
      periodStart: "2026-10-16",
      periodEnd: "2026-11-15",
      visitsInPeriod: 0,
    });
    const { container } = render(<AgentAnalyticsPagesCoverage brandId="b" />);
    await waitFor(() =>
      expect(container.textContent).toContain("No AI crawler visit is recorded for this period"),
    );
    expect(container.textContent).not.toContain("/services");
    expect(container.textContent).not.toContain("Create task");
  });

  it("with visits on record, the pages with none are listed", async () => {
    stubCoverage({
      gap: {
        sitemapUrls: SITEMAP,
        crawledUrls: ["https://acme.com.au/"],
        gaps: SITEMAP.slice(1),
        coveragePercent: 33,
      },
      topRetrieval: [],
      topIndexing: [],
      periodStart: "2026-10-16",
      periodEnd: "2026-11-15",
      visitsInPeriod: 40,
    });
    const { container } = render(<AgentAnalyticsPagesCoverage brandId="b" />);
    await waitFor(() => expect(container.textContent).toContain("/services"));
    expect(container.textContent).toContain("Create task");
  });

  it("crawlerVisitsRecorded reads the count, else the visits the response shows", () => {
    const base = {
      gap: { sitemapUrls: [], crawledUrls: [], gaps: [], coveragePercent: 0 },
      topRetrieval: [],
      topIndexing: [],
      periodStart: "",
      periodEnd: "",
    };
    expect(crawlerVisitsRecorded({ ...base, visitsInPeriod: 0 })).toBe(false);
    expect(crawlerVisitsRecorded({ ...base, visitsInPeriod: 3 })).toBe(true);
    expect(crawlerVisitsRecorded(base)).toBe(false);
    expect(crawlerVisitsRecorded(undefined)).toBe(false);
  });
});

describe("a crawler fetch is not a citation", () => {
  it("a page fetched by a retrieval bot isn't badged 'Cited in AI answers', and no 2-4 week claim", async () => {
    stubCoverage({
      gap: { sitemapUrls: [], crawledUrls: [], gaps: [], coveragePercent: 0 },
      topRetrieval: [
        {
          url: "https://acme.com.au/services",
          hitCount: 7,
          purpose: "retrieval",
          lastVisit: "2026-11-10",
        },
      ],
      topIndexing: [],
      periodStart: "2026-10-16",
      periodEnd: "2026-11-15",
      visitsInPeriod: 7,
    });
    const { container } = render(<AgentAnalyticsPagesCoverage brandId="b" />);
    await waitFor(() => expect(container.textContent).toContain("Fetched by a retrieval bot"));
    expect(container.textContent).not.toContain("Cited in AI answers");
    expect(container.textContent).not.toContain("a human asked an AI");
    expect(container.textContent).not.toMatch(/2.4 weeks later/);
  });
});

describe("the setup panel's connection state", () => {
  it("connected only when a source has sent visits; the snippet only when it has", () => {
    expect(connectionState(undefined)).toEqual({
      connected: false,
      snippetReceiving: false,
      lastVisitAt: null,
    });
    expect(
      connectionState([
        { source: "log_upload", visits: 3, lastVisitAt: "2026-09-01 00:00:00+00" },
        { source: "visit_api", visits: 0, lastVisitAt: null },
      ]),
    ).toEqual({ connected: true, snippetReceiving: false, lastVisitAt: "2026-09-01 00:00:00+00" });
  });
});

describe("Volume by Vendor's Tier column", () => {
  it("the SQL returns crawlerTier, the field the table reads", () => {
    const src = readFileSync("lib/agent-analytics/metrics.ts", "utf8");
    expect(src).toMatch(/r\.crawler_tier AS "crawlerTier"/);
    const table = readFileSync("components/domain/retrieval/agent-analytics-section.tsx", "utf8");
    expect(table).toMatch(/\{v\.crawlerTier\}/);
  });

  it("the unverified share is shown plainly, with no warning sign implying impersonation", () => {
    const table = readFileSync("components/domain/retrieval/agent-analytics-section.tsx", "utf8");
    expect(table).not.toMatch(/unverifiedRate > 25/);
  });
});
