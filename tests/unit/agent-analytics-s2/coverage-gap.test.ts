import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/client", () => ({
  serviceDb: { execute: vi.fn() },
}));

import { serviceDb } from "@/db/client";
import { getCoverageGap, getTopPagesByPurpose } from "@/lib/agent-analytics/metrics";

const mockExecute = serviceDb.execute as ReturnType<typeof vi.fn>;

describe("getCoverageGap — sitemap pages never crawled by AI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sitemap of 10, 6 crawled → 4 in the gap", async () => {
    const sitemapUrls = Array.from({ length: 10 }, (_, i) => `https://example.com/page-${i}`);
    const crawledUrls = sitemapUrls.slice(0, 6);

    mockExecute.mockResolvedValueOnce({
      rows: crawledUrls.map((url) => ({ visited_url: url })),
    });

    const result = await getCoverageGap(
      "brand-1",
      sitemapUrls,
      new Date("2026-07-01"),
      new Date("2026-07-31"),
    );

    expect(result.gaps).toHaveLength(4);
    expect(result.coveragePercent).toBe(60);
    expect(result.crawledUrls).toHaveLength(6);
    expect(result.sitemapUrls).toHaveLength(10);
  });

  it("empty sitemap returns zero coverage", async () => {
    const result = await getCoverageGap(
      "brand-1",
      [],
      new Date("2026-07-01"),
      new Date("2026-07-31"),
    );

    expect(result.gaps).toHaveLength(0);
    expect(result.coveragePercent).toBe(0);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("full coverage = 100%, zero gaps", async () => {
    const sitemapUrls = ["https://example.com/a", "https://example.com/b"];
    mockExecute.mockResolvedValueOnce({
      rows: sitemapUrls.map((url) => ({ visited_url: url })),
    });

    const result = await getCoverageGap(
      "brand-1",
      sitemapUrls,
      new Date("2026-07-01"),
      new Date("2026-07-31"),
    );

    expect(result.gaps).toHaveLength(0);
    expect(result.coveragePercent).toBe(100);
  });
});

describe("getTopPagesByPurpose — retrieval hits ranked correctly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pages sorted by hit count descending", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { url: "https://example.com/booking", hit_count: 47, purpose: "retrieval", last_visit: "2026-07-15" },
        { url: "https://example.com/about", hit_count: 12, purpose: "retrieval", last_visit: "2026-07-14" },
        { url: "https://example.com/contact", hit_count: 5, purpose: "retrieval", last_visit: "2026-07-10" },
      ],
    });

    const results = await getTopPagesByPurpose(
      "brand-1",
      "retrieval",
      new Date("2026-07-01"),
      new Date("2026-07-31"),
    );

    expect(results).toHaveLength(3);
    expect(results[0].hitCount).toBe(47);
    expect(results[0].url).toBe("https://example.com/booking");
    expect(results[1].hitCount).toBe(12);
    expect(results[2].hitCount).toBe(5);
  });
});
