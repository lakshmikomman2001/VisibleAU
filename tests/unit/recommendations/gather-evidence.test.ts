import { afterEach, describe, expect, it, vi } from "vitest";
import { checkWikipediaAuStatus } from "@/lib/brand-entity/wikipedia-au";
import type { DirectoryCitationResult } from "@/lib/directories/citation-counts";
import { getDirectoriesForMarket } from "@/lib/directories/registry";
import {
  type EvidenceCheckers,
  gatherRecommendationEvidence,
  toPageFreshness,
} from "@/lib/recommendations/gather-evidence";
import { parseLastModifiedHeader } from "@/lib/retrieval/content-auditor";

const AU_DIRECTORIES = getDirectoriesForMarket("AU_EN");
const hipages = AU_DIRECTORIES.find((d) => d.key === "hipages")!;
const oneflare = AU_DIRECTORIES.find((d) => d.key === "oneflare")!;
const zeroHits: Omit<DirectoryCitationResult, "directory"> = {
  citedCount: 0,
  totalAnswers: 37,
  citedUrls: [],
  ownerProfileCited: false,
  ownerStatus: null,
  ownerConfirmedAt: null,
};

const NOW = new Date("2026-10-16T00:00:00.000Z");
const input = {
  brandId: "b-1",
  brandName: "Bondi Plumbing",
  auditId: "audit-1",
  region: "au",
  categories: ["trades_plumbing"],
};

function checkers(overrides: Partial<EvidenceCheckers> = {}): EvidenceCheckers {
  return {
    checkWikipediaAuStatus: async () => ({
      status: "not_found",
      query: "Bondi Plumbing Australia",
    }),
    loadCrawledPages: async () => [
      { pageUrl: "https://bondi.test/pricing", lastModified: "2025-06-01T00:00:00.000Z" },
      { pageUrl: "https://bondi.test/", lastModified: null },
    ],
    getDirectoryCitations: async () => ({ totalAnswers: 0, computedAt: NOW.toISOString(), results: [] }),
    ...overrides,
  };
}

describe("gatherRecommendationEvidence", () => {
  it("maps real checker results into evidence", async () => {
    const e = await gatherRecommendationEvidence(input, checkers(), { now: NOW });
    // Vunnara (21 Oct, "directory listings... never scraping", Part E):
    // a real citation count now backs this -- "ok" with an empty
    // findings list when nothing was cited, never "not_run".
    expect(e.directories).toEqual({
      status: "ok",
      data: { computedAt: NOW.toISOString(), findings: [] },
    });
    expect(e.wikipedia).toEqual({
      status: "ok",
      data: { articleExists: false, articleUrl: null, query: "Bondi Plumbing Australia" },
    });
    expect(e.pageFreshness.status).toBe("ok");
    if (e.pageFreshness.status === "ok") {
      expect(e.pageFreshness.data.datedPages).toEqual([
        {
          url: "https://bondi.test/pricing",
          lastModified: "2025-06-01T00:00:00.000Z",
          daysSinceModified: 502,
          freshnessRisk: "stale",
        },
      ]);
      expect(e.pageFreshness.data.undatedPageCount).toBe(1);
    }
    // No real notability checker exists -- honestly "not_run".
    expect(e.notability).toEqual({ status: "not_run" });
  });

  it("a throwing checker becomes 'unavailable' and never fails the rest", async () => {
    const e = await gatherRecommendationEvidence(
      input,
      checkers({
        loadCrawledPages: async () => {
          throw new Error("db down");
        },
      }),
      { now: NOW },
    );
    expect(e.pageFreshness).toEqual({ status: "unavailable", reason: "db down" });
    expect(e.wikipedia.status).toBe("ok");
  });

  it("a hanging checker is time-boxed to 'unavailable'", async () => {
    const e = await gatherRecommendationEvidence(
      input,
      checkers({ checkWikipediaAuStatus: () => new Promise(() => {}) }),
      { timeoutMs: 20, now: NOW },
    );
    expect(e.wikipedia.status).toBe("unavailable");
  });

  it("a Wikipedia API failure is 'unavailable', never 'no article exists'", async () => {
    const e = await gatherRecommendationEvidence(
      input,
      checkers({
        checkWikipediaAuStatus: async () => ({
          status: "unavailable",
          reason: "HTTP 503",
          query: "Bondi Plumbing Australia",
        }),
      }),
      { now: NOW },
    );
    expect(e.wikipedia).toEqual({ status: "unavailable", reason: "HTTP 503" });
  });

  it("maps a real directory citation count into 'ok' evidence, keeping only cited directories", async () => {
    const e = await gatherRecommendationEvidence(
      input,
      checkers({
        getDirectoryCitations: async () => ({
          totalAnswers: 37,
          computedAt: NOW.toISOString(),
          results: [
            {
              directory: hipages,
              citedCount: 3,
              totalAnswers: 37,
              citedUrls: ["https://hipages.com.au/connect/someone-else"],
              ownerProfileCited: false,
              ownerStatus: "not_listed",
              ownerConfirmedAt: "2026-10-01T00:00:00.000Z",
            },
            { ...zeroHits, directory: oneflare },
          ],
        }),
      }),
      { now: NOW },
    );
    expect(e.directories).toEqual({
      status: "ok",
      data: {
        computedAt: NOW.toISOString(),
        findings: [
          {
            key: "hipages",
            name: "hipages",
            citedCount: 3,
            totalAnswers: 37,
            citedUrls: ["https://hipages.com.au/connect/someone-else"],
            ownerProfileCited: false,
            ownerStatus: "not_listed",
            ownerConfirmedAt: "2026-10-01T00:00:00.000Z",
          },
        ],
      },
    });
  });

  it("a throwing directory-citations checker becomes 'unavailable', same as every other checker", async () => {
    const e = await gatherRecommendationEvidence(
      input,
      checkers({
        getDirectoryCitations: async () => {
          throw new Error("query failed");
        },
      }),
      { now: NOW },
    );
    expect(e.directories).toEqual({ status: "unavailable", reason: "query failed" });
  });
});

describe("toDirectoryVisibility", () => {
  it("keeps only directories with citedCount > 0 -- nothing to say about one AI never cited", async () => {
    const { toDirectoryVisibility } = await import("@/lib/recommendations/gather-evidence");
    const result = toDirectoryVisibility({
      totalAnswers: 10,
      computedAt: "2026-10-21T00:00:00.000Z",
      results: [
        { ...zeroHits, directory: oneflare, totalAnswers: 10 },
        { ...zeroHits, directory: hipages, totalAnswers: 10, citedCount: 2, citedUrls: ["https://hipages.com.au/connect/x"] },
      ],
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.findings).toHaveLength(1);
      expect(result.data.findings[0].key).toBe("hipages");
    }
  });

  it("totalAnswers === 0 is still 'ok' with empty findings, never 'unavailable'", async () => {
    const { toDirectoryVisibility } = await import("@/lib/recommendations/gather-evidence");
    const result = toDirectoryVisibility({ totalAnswers: 0, computedAt: "2026-10-21T00:00:00.000Z", results: [] });
    expect(result).toEqual({
      status: "ok",
      data: { computedAt: "2026-10-21T00:00:00.000Z", findings: [] },
    });
  });
});

describe("toPageFreshness", () => {
  it("no crawled rows -> unavailable", () => {
    expect(toPageFreshness([], NOW).status).toBe("unavailable");
  });

  it("garbage dates count as undated, not stale", () => {
    const r = toPageFreshness([{ pageUrl: "https://x.test", lastModified: "not a date" }], NOW);
    expect(r).toEqual({ status: "ok", data: { datedPages: [], undatedPageCount: 1 } });
  });
});

describe("parseLastModifiedHeader", () => {
  it("parses a real HTTP date", () => {
    expect(
      parseLastModifiedHeader(
        { "last-modified": "Sun, 01 Jun 2025 00:00:00 GMT" },
        NOW,
      )?.toISOString(),
    ).toBe("2025-06-01T00:00:00.000Z");
  });

  it("missing, unparseable, or future -> null", () => {
    expect(parseLastModifiedHeader({}, NOW)).toBeNull();
    expect(parseLastModifiedHeader({ "last-modified": "yesterday-ish" }, NOW)).toBeNull();
    expect(
      parseLastModifiedHeader({ "last-modified": "Fri, 01 Jan 2027 00:00:00 GMT" }, NOW),
    ).toBeNull();
  });
});

describe("checkWikipediaAuStatus (fetch mocked)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const respond = (body: unknown, status = 200) =>
    vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

  it("found when the top result's title contains the brand", async () => {
    respond({ query: { search: [{ title: "Bondi Plumbing", snippet: "" }] } });
    const r = await checkWikipediaAuStatus("Bondi Plumbing");
    expect(r).toMatchObject({
      status: "found",
      url: "https://en.wikipedia.org/wiki/Bondi_Plumbing",
    });
  });

  it("not_found when the search returns nothing about the brand", async () => {
    respond({ query: { search: [{ title: "Bondi Beach", snippet: "A beach in Sydney" }] } });
    expect((await checkWikipediaAuStatus("Bondi Plumbing")).status).toBe("not_found");
  });

  it("not_found on zero results", async () => {
    respond({ query: { search: [] } });
    expect((await checkWikipediaAuStatus("Bondi Plumbing")).status).toBe("not_found");
  });

  it("unavailable on HTTP error, network error, or malformed JSON", async () => {
    respond({}, 503);
    expect((await checkWikipediaAuStatus("Bondi Plumbing")).status).toBe("unavailable");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    expect((await checkWikipediaAuStatus("Bondi Plumbing")).status).toBe("unavailable");
    respond({ unexpected: true });
    expect((await checkWikipediaAuStatus("Bondi Plumbing")).status).toBe("unavailable");
  });
});
