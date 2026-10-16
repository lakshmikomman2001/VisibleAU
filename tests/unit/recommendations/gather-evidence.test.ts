import { afterEach, describe, expect, it, vi } from "vitest";
import { checkWikipediaAuStatus } from "@/lib/brand-entity/wikipedia-au";
import {
  type EvidenceCheckers,
  gatherRecommendationEvidence,
  toPageFreshness,
} from "@/lib/recommendations/gather-evidence";
import { parseLastModifiedHeader } from "@/lib/retrieval/content-auditor";

const NOW = new Date("2026-10-16T00:00:00.000Z");
const input = { brandId: "b-1", brandName: "Bondi Plumbing" };

function checkers(overrides: Partial<EvidenceCheckers> = {}): EvidenceCheckers {
  return {
    checkAuDirectories: async () => ({
      auDirectoryCount: 1,
      auDirectoryPresence: [
        {
          name: "Hipages",
          present: false,
          status: "not_listed",
          url: null,
          finding: "Not found on Hipages.",
        },
        {
          name: "Yellow Pages AU",
          present: true,
          status: "listed",
          url: "https://yp.test",
          finding: "Listed on Yellow Pages AU.",
        },
      ],
    }),
    checkWikipediaAuStatus: async () => ({
      status: "not_found",
      query: "Bondi Plumbing Australia",
    }),
    loadCrawledPages: async () => [
      { pageUrl: "https://bondi.test/pricing", lastModified: "2025-06-01T00:00:00.000Z" },
      { pageUrl: "https://bondi.test/", lastModified: null },
    ],
    ...overrides,
  };
}

describe("gatherRecommendationEvidence", () => {
  it("maps real checker results into evidence", async () => {
    const e = await gatherRecommendationEvidence(input, checkers(), { now: NOW });
    expect(e.directories.status).toBe("ok");
    if (e.directories.status === "ok") {
      expect(e.directories.data.results.map((r) => r.status)).toEqual(["not_listed", "listed"]);
    }
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
        checkAuDirectories: async () => {
          throw new Error("ECONNRESET");
        },
        loadCrawledPages: async () => {
          throw new Error("db down");
        },
      }),
      { now: NOW },
    );
    expect(e.directories).toEqual({ status: "unavailable", reason: "ECONNRESET" });
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

  it("an empty directory result is 'unavailable', not 'all listed'", async () => {
    const e = await gatherRecommendationEvidence(
      input,
      checkers({
        checkAuDirectories: async () => ({ auDirectoryCount: 0, auDirectoryPresence: [] }),
      }),
      { now: NOW },
    );
    expect(e.directories.status).toBe("unavailable");
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
