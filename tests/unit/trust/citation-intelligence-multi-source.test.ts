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
import { buildCitationSourceIntelligence, NO_CITATIONS_SOURCE_TYPE } from "@/lib/trust/citation-intelligence";

function mockTx(brandDomain: string, auditCitations: Record<string, unknown>[]) {
  let selectCallCount = 0;
  const inserted: Record<string, unknown>[] = [];

  const tx: Record<string, unknown> = {
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
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        // Task #46 follow-up: the aggregate replace does a bare,
        // directly-awaitable array insert (no onConflict chain) --
        // these tests only assert on `result[]` (computed in-memory,
        // before any DB write), not on the aggregate's own rows, so
        // this just needs to resolve without throwing.
        if (Array.isArray(v)) return Promise.resolve();
        return {
          onConflictDoNothing: () => {
            inserted.push(v);
            return Promise.resolve();
          },
        };
      },
    }),
    delete: () => ({ where: () => Promise.resolve() }),
    transaction: (cb: (sp: typeof tx) => unknown) => cb(tx),
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

  // Task #46 follow-up (live-data correction): task #43's original
  // design counted this as one phantom "other" citation -- exactly
  // why Gemini's real "cited nothing" answers showed up as "other, 5
  // citations, 0 domains" against live Bondi data. A response that
  // cited no sources now contributes to NEITHER a category NOR the
  // "other" bucket -- it surfaces instead as a NO_CITATIONS_SOURCE_TYPE
  // row (Part B's "{Engine} cited no sources in {N} answers.").
  it("a response with zero extracted/structured sources contributes to NO category -- not even 'other' -- and surfaces as NO_CITATIONS_SOURCE_TYPE instead", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      { engine: "gemini", brandMentioned: false, prompt: "No citable sources here", citedSources: [] },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-3", "brand-3", "org-3");

    expect(result.find((r) => r.sourceType === "other")).toBeUndefined();
    expect(result).toHaveLength(1);
    expect(result[0].sourceType).toBe(NO_CITATIONS_SOURCE_TYPE);
    expect(result[0].engine).toBe("gemini");
    expect(result[0].citationCount).toBe(1); // 1 organic response, not 1 citation
  });
});

describe("buildCitationSourceIntelligence -- 'other' is unclassified, not badged Critical, but stays in the denominator", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Task #46 follow-up: genuinely-unclassifiable, non-empty citedSources
  // (a real-shaped domain matching no classifier pattern) -- NOT an
  // empty array, which no longer lands in "other" at all (see the
  // NO_CITATIONS_SOURCE_TYPE describe block above).
  it("5/5 responses with real-but-unclassifiable sources ('other', 100% share, brand absent) -> gapSeverity is 'unclassified', never 'critical'", async () => {
    const citations = Array.from({ length: 5 }, (_, i) => ({
      engine: "perplexity",
      brandMentioned: false,
      prompt: `Prompt ${i}`,
      citedSources: [{ domain: "randomsite123.com.au", url: `https://randomsite123.com.au/${i}` }],
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
    const unclassifiable = (i: number) => [
      { domain: "randomsite123.com.au", url: `https://randomsite123.com.au/${i}` },
    ];
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "chatgpt",
        brandMentioned: false,
        prompt: "Prompt A",
        citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }],
      },
      { engine: "chatgpt", brandMentioned: false, prompt: "Prompt B", citedSources: unclassifiable(1) },
      { engine: "chatgpt", brandMentioned: false, prompt: "Prompt C", citedSources: unclassifiable(2) },
      { engine: "chatgpt", brandMentioned: false, prompt: "Prompt D", citedSources: unclassifiable(3) },
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

describe("buildCitationSourceIntelligence -- top_domains normalisation doesn't disturb classification (task #45 follow-up)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("google.com/maps and business.google.com still classify review_site, and both normalise to google.com in top_domains", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "chatgpt",
        brandMentioned: false,
        prompt: "Prompt A",
        citedSources: [
          { domain: "maps.google.com", url: "https://www.google.com/maps/place/a" },
          { domain: "business.google.com", url: "https://business.google.com/b" },
        ],
      },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-9", "brand-9", "org-9");

    expect(result).toHaveLength(1);
    expect(result[0].sourceType).toBe("review_site"); // classification: unaffected by display-only normalisation
    expect(result[0].topDomains).toHaveLength(1);
    expect(result[0].topDomains[0].domain).toBe("google.com");
    expect(result[0].topDomains[0].count).toBe(2);
  });

  it("neither sourceType nor the isBrand badge is fooled by a domain that merely CONTAINS the brand's domain as a substring (task #46, 6th follow-up)", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "chatgpt",
        brandMentioned: false,
        prompt: "Prompt A",
        citedSources: [
          // Contains the brand's domain as a literal substring, but its
          // actual registrable domain is a different site entirely.
          // classifySourceTypeWithBrand and the top_domains badge both
          // now go through the same shared isBrandDomain()
          // registrable-domain comparison (lib/audit/extract-citations.ts)
          // -- previously the classifier's OWN substring check disagreed
          // with this badge and called it "brand_owned" anyway.
          {
            domain: "bondiplumbing.com.au.evil-tracker.com",
            url: "https://bondiplumbing.com.au.evil-tracker.com/phish",
          },
        ],
      },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-10", "brand-10", "org-10");

    expect(result[0].sourceType).toBe("other"); // no longer misclassified as brand_owned
    expect(result[0].topDomains[0].domain).toBe("evil-tracker.com");
    expect(result[0].topDomains[0].isBrand).toBeUndefined(); // NOT flagged as the brand's own domain
  });

  it("isBrand IS set for a genuine www./subdomain variant of the brand's own registrable domain", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "chatgpt",
        brandMentioned: false,
        prompt: "Prompt A",
        citedSources: [
          { domain: "www.bondiplumbing.com.au", url: "https://www.bondiplumbing.com.au/" },
        ],
      },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-11", "brand-11", "org-11");

    expect(result[0].topDomains[0].domain).toBe("bondiplumbing.com.au");
    expect(result[0].topDomains[0].isBrand).toBe(true);
  });

  // Task #46 (6th follow-up): the invariant the shared isBrandDomain()
  // helper is supposed to guarantee -- sourceType and the isBrand badge
  // can no longer disagree, because both now derive from the exact same
  // registrable-domain comparison on the exact same rawDomain.
  it("invariant: sourceType === 'brand_owned' IFF every one of its topDomains entries has isBrand: true", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "chatgpt",
        brandMentioned: false,
        prompt: "Prompt A",
        citedSources: [
          { domain: "bondiplumbing.com.au", url: "https://bondiplumbing.com.au/" },
          { domain: "www.bondiplumbing.com.au", url: "https://www.bondiplumbing.com.au/contact" },
        ],
      },
      {
        engine: "chatgpt",
        brandMentioned: false,
        prompt: "Prompt B",
        citedSources: [
          { domain: "hipages.com.au", url: "https://hipages.com.au/a" },
          {
            domain: "bondiplumbing.com.au.evil-tracker.com",
            url: "https://bondiplumbing.com.au.evil-tracker.com/x",
          },
        ],
      },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-inv", "brand-inv", "org-inv");

    for (const card of result) {
      const everyDomainIsBrand = card.topDomains.length > 0 && card.topDomains.every((d) => d.isBrand === true);
      expect(card.sourceType === "brand_owned").toBe(everyDomainIsBrand);
    }
    // Concretely: the brand_owned card exists and is pure (both its
    // domains are the brand's own, via the registrable-domain and
    // www.-variant reduction); the evil-tracker.com lookalike (contains
    // the brand's domain as a substring, but its real registrable
    // domain is a different site) and the real hipages.com.au directory
    // are NOT brand_owned.
    expect(result.some((c) => c.topDomains.some((d) => d.domain === "evil-tracker.com"))).toBe(true);
    const brandCard = result.find((c) => c.sourceType === "brand_owned");
    expect(brandCard).toBeDefined();
    expect(brandCard?.topDomains.every((d) => d.isBrand === true)).toBe(true);
    expect(result.some((c) => c.sourceType === "au_directory")).toBe(true);
  });
});

describe("buildCitationSourceIntelligence -- count integrity (task #46): junk entries never count", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a response citing an IP address alongside a real domain only counts the real one", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "gemini",
        brandMentioned: false,
        prompt: "Prompt A",
        citedSources: [
          { domain: "192.168.1.1", url: "https://192.168.1.1/page" },
          { domain: "hipages.com.au", url: "https://hipages.com.au/a" },
        ],
      },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-12", "brand-12", "org-12");

    expect(result).toHaveLength(1); // only au_directory -- no card for the IP
    expect(result[0].sourceType).toBe("au_directory");
    expect(result[0].citationCount).toBe(1); // not 2
    expect(result[0].topDomains).toEqual([
      expect.objectContaining({ domain: "hipages.com.au", count: 1 }),
    ]);
  });

  // Task #46 follow-up Part B: a card whose every entry fails
  // validation no longer produces a (misleadingly-countless) category
  // card -- but, per Part B, it's also no longer silently invisible.
  // The engine shows up as NO_CITATIONS_SOURCE_TYPE instead -- "cited
  // no sources" is the honest description of "cited only unresolvable
  // junk", same as citing literally nothing.
  it("a card whose every entry fails validation is never produced -- 'Gemini other: 5 citations, 0 domains' becomes a 'cited no sources' row instead", async () => {
    const junkCitations = Array.from({ length: 5 }, (_, i) => ({
      engine: "gemini",
      brandMentioned: false,
      prompt: `Prompt ${i}`,
      citedSources: [{ domain: "192.168.1.1", url: `https://192.168.1.1/page${i}` }],
    }));
    const { tx } = mockTx("bondiplumbing.com.au", junkCitations);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-13", "brand-13", "org-13");

    expect(result.find((r) => r.sourceType === "other")).toBeUndefined();
    expect(result).toHaveLength(1);
    expect(result[0].sourceType).toBe(NO_CITATIONS_SOURCE_TYPE);
    expect(result[0].citationCount).toBe(5); // 5 organic responses, not 5 "citations"
  });

  it("invariant: citationCount === sum(top_domains[].count) when the card has <= 8 distinct domains", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "claude",
        brandMentioned: false,
        prompt: "Prompt A",
        citedSources: [
          { domain: "mpansw.com.au", url: "https://mpansw.com.au/a" },
          { domain: "192.168.1.1", url: "https://192.168.1.1/junk" }, // invalid -- must not inflate citationCount
          { domain: "hia.com.au", url: "https://hia.com.au/b" },
        ],
      },
      {
        engine: "claude",
        brandMentioned: false,
        prompt: "Prompt B",
        citedSources: [{ domain: "hia.com.au", url: "https://hia.com.au/c" }],
      },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-14", "brand-14", "org-14");
    const industryBody = result.find((r) => r.sourceType === "industry_association");

    expect(industryBody?.citationCount).toBe(3); // mpansw + hia + hia -- the IP never counted
    const sum = industryBody?.topDomains.reduce((acc, d) => acc + d.count, 0);
    expect(sum).toBe(industryBody?.citationCount); // exact equality -- <= 8 distinct domains
  });

  it("invariant holds at the >8-distinct-domains boundary: citationCount >= sum(top_domains[].count)", async () => {
    const manyDomainCitations = Array.from({ length: 10 }, (_, i) => ({
      engine: "chatgpt",
      brandMentioned: false,
      prompt: `Prompt ${i}`,
      citedSources: [{ domain: `site${i}.com.au`, url: `https://site${i}.com.au/` }],
    }));
    const { tx } = mockTx("bondiplumbing.com.au", manyDomainCitations);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-15", "brand-15", "org-15");
    const other = result.find((r) => r.sourceType === "other");

    expect(other?.citationCount).toBe(10);
    expect(other?.topDomains).toHaveLength(8); // capped
    const sum = other?.topDomains.reduce((acc, d) => acc + d.count, 0) ?? 0;
    expect(other?.citationCount).toBeGreaterThanOrEqual(sum);
  });
});

describe("buildCitationSourceIntelligence -- gov.au groups by full hostname (task #46 Part D)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fairtrading.nsw.gov.au and service.nsw.gov.au stay as two distinct top_domains entries, not merged into nsw.gov.au", async () => {
    const { tx } = mockTx("bondiplumbing.com.au", [
      {
        engine: "perplexity",
        brandMentioned: false,
        prompt: "Prompt A",
        citedSources: [
          { domain: "fairtrading.nsw.gov.au", url: "https://fairtrading.nsw.gov.au/a" },
        ],
      },
      {
        engine: "perplexity",
        brandMentioned: false,
        prompt: "Prompt B",
        citedSources: [{ domain: "service.nsw.gov.au", url: "https://service.nsw.gov.au/b" }],
      },
    ]);

    const result = await buildCitationSourceIntelligence(tx as any, "audit-16", "brand-16", "org-16");
    const regulator = result.find((r) => r.sourceType === "government_regulator");

    expect(regulator?.topDomains.map((d) => d.domain).sort()).toEqual([
      "fairtrading.nsw.gov.au",
      "service.nsw.gov.au",
    ]);
  });
});
