/**
 * Task #43, Parts B + C:
 * - classify-citation-sources.ts only ever wrote ONE citedSourceType per
 *   citations row (classified[0]) -- "Citations: N" counted responses,
 *   not cited sources. buildCitationSourceIntelligence now re-classifies
 *   every URL in each response's citedSources, counting per cited
 *   source, not per response.
 * - "other" (unclassified) must never be badged on the same
 *   Covered/Warning/Critical/Opportunity scale as a real category, but
 *   must still count toward the engine's total (the denominator for
 *   every other category's share).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCitationSourceIntelligence } from "@/lib/trust/citation-intelligence";

function mockTx(brandDomain: string, auditCitations: Record<string, unknown>[]) {
  let selectCallCount = 0;
  const inserted: Record<string, unknown>[] = [];

  const tx = {
    select: () => {
      selectCallCount++;
      const isBrandQuery = selectCallCount === 1;
      return {
        from: () => ({
          where: () => Promise.resolve(isBrandQuery ? [{ domain: brandDomain }] : auditCitations),
        }),
      };
    },
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: () => {
          inserted.push(v);
          return Promise.resolve();
        },
        onConflictDoUpdate: () => Promise.resolve(),
      }),
    }),
  };

  return { tx, inserted };
}

describe("buildCitationSourceIntelligence -- counts every cited source, not just the first", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("one response citing 3 domains of different types contributes to 3 distinct categories, not 1", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "perplexity",
        brandMentioned: false,
        prompt: "Best plumber in Sydney?",
        citedSources: [
          { domain: "hipages.com.au", url: "https://hipages.com.au/connect/plumber" },
          { domain: "productreview.com.au", url: "https://productreview.com.au/p/brand" },
          { domain: "news.com.au", url: "https://news.com.au/story" },
        ],
      },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-1", "brand-1", "org-1");

    expect(result).toHaveLength(3);
    const types = result.map((r) => r.sourceType).sort();
    expect(types).toEqual(["au_directory", "news_article", "review_site"]);
    // 1 source each, out of 3 total for this engine -> 33.33% each, not 100%.
    for (const r of result) {
      expect(r.citationCount).toBe(1);
      expect(r.citationShare).toBeCloseTo(33.33, 1);
    }
  });

  it("the same engine's second response, citing 2 more au_directory domains, adds to that category's count (not a new row)", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "chatgpt",
        brandMentioned: false,
        prompt: "Prompt A",
        citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }],
      },
      {
        engine: "chatgpt",
        brandMentioned: false,
        prompt: "Prompt B",
        citedSources: [
          { domain: "oneflare.com.au", url: "https://oneflare.com.au/b" },
          { domain: "airtasker.com", url: "https://www.airtasker.com/c" },
        ],
      },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-2", "brand-2", "org-2");

    expect(result).toHaveLength(1);
    expect(result[0].sourceType).toBe("au_directory");
    expect(result[0].citationCount).toBe(3); // 1 + 2, three distinct sources across two responses
    expect(result[0].citationShare).toBe(100);
  });

  it("a response with zero extracted/structured sources still counts as one 'other' unit, not silently dropped", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      { engine: "gemini", brandMentioned: false, prompt: "No citable sources here", citedSources: [] },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-3", "brand-3", "org-3");

    expect(result).toHaveLength(1);
    expect(result[0].sourceType).toBe("other");
    expect(result[0].citationCount).toBe(1);
  });
});

describe("buildCitationSourceIntelligence -- 'other' is unclassified, not badged Critical, but stays in the denominator", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("5/5 responses unclassified ('other', 100% share, brand absent) -> gapSeverity is 'unclassified', never 'critical'", async () => {
    const citations = Array.from({ length: 5 }, (_, i) => ({
      engine: "perplexity",
      brandMentioned: false,
      prompt: `Prompt ${i}`,
      citedSources: [],
    }));
    const { tx } = mockTx("bondiplumbing.com.au", citations);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-4", "brand-4", "org-4");

    expect(result).toHaveLength(1);
    expect(result[0].sourceType).toBe("other");
    expect(result[0].citationShare).toBe(100);
    expect(result[0].gapSeverity).toBe("unclassified");
    expect(result[0].gapSeverity).not.toBe("critical");
  });

  it("'other' is NOT excluded from the share denominator -- a real category's share reflects the full total, including unclassified sources", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "chatgpt",
        brandMentioned: false,
        prompt: "Prompt A",
        citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }],
      },
      { engine: "chatgpt", brandMentioned: false, prompt: "Prompt B", citedSources: [] },
      { engine: "chatgpt", brandMentioned: false, prompt: "Prompt C", citedSources: [] },
      { engine: "chatgpt", brandMentioned: false, prompt: "Prompt D", citedSources: [] },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-5", "brand-5", "org-5");

    const auDir = result.find((r) => r.sourceType === "au_directory");
    const other = result.find((r) => r.sourceType === "other");

    // 1 au_directory source out of 4 total (1 classified + 3 "other") = 25%.
    // NOT 100%, which is what excluding "other" from the denominator would give.
    expect(auDir?.citationShare).toBe(25);
    expect(other?.citationShare).toBe(75);
    expect(other?.gapSeverity).toBe("unclassified");
  });

  it("a real category still gets genuine Critical/Warning/Opportunity/Covered severity -- the override is specific to 'other'", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "perplexity",
        brandMentioned: false,
        prompt: "Prompt A",
        citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }],
      },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-6", "brand-6", "org-6");

    expect(result[0].sourceType).toBe("au_directory");
    expect(result[0].citationShare).toBe(100);
    expect(result[0].gapSeverity).toBe("critical"); // genuine >20% share, brand absent -- real severity, not overridden
  });
});

describe("buildCitationSourceIntelligence -- brandPresent definition", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("brandPresent is true when the response that cited the source also mentioned the brand", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "chatgpt",
        brandMentioned: true,
        prompt: "Is Bondi Plumbing on hipages?",
        citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }],
      },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-7", "brand-7", "org-7");
    expect(result[0].brandPresentInSource).toBe(true);
    expect(result[0].gapSeverity).toBe("covered");
  });

  it("brandPresent is true when the cited source IS the brand's own domain, even if brandMentioned is false", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "chatgpt",
        brandMentioned: false,
        prompt: "What do local plumbers' sites look like?",
        citedSources: [{ domain: "bondiplumbing.com.au", url: "https://bondiplumbing.com.au/" }],
      },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-8", "brand-8", "org-8");
    expect(result[0].sourceType).toBe("brand_owned");
    expect(result[0].brandPresentInSource).toBe(true);
  });
});
