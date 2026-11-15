import { describe, expect, it, vi } from "vitest";
import { audits, brands, citations, topicalCoverageGaps } from "@/db/schema";

vi.mock("@/db/client", () => ({
  withRlsContext: vi.fn(),
  serviceDb: {},
}));

/**
 * Task #46 (5th follow-up): diagnose() now also queries `audits`
 * (latest completed audit), `brands` (domain lookup), and `citations`
 * (the audit's organic, run_number=1 rows) -- dispatched here by which
 * table object `.from()` was called with, since each query has a
 * different shape (gaps/audits chain .orderBy().limit(); brands/
 * citations resolve directly off .where()).
 */
function makeMockTx(
  opts: {
    gaps?: unknown[];
    latestAudit?: { id: string; auditNumber: number } | undefined;
    brandDomain?: string | undefined;
    citationRows?: unknown[];
    tablesExist?: boolean;
  } = {},
) {
  const gaps = opts.gaps ?? [];
  const auditRows = opts.latestAudit ? [opts.latestAudit] : [];
  const brandRows =
    opts.brandDomain !== undefined ? [{ domain: opts.brandDomain }] : [{ domain: null }];
  const citationRows = opts.citationRows ?? [];

  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === topicalCoverageGaps) {
          return { where: () => ({ orderBy: () => ({ limit: () => Promise.resolve(gaps) }) }) };
        }
        if (table === audits) {
          return {
            where: () => ({ orderBy: () => ({ limit: () => Promise.resolve(auditRows) }) }),
          };
        }
        if (table === brands) {
          return { where: () => Promise.resolve(brandRows) };
        }
        if (table === citations) {
          return { where: () => Promise.resolve(citationRows) };
        }
        throw new Error("makeMockTx: unexpected table in .from()");
      },
    }),
    execute: vi.fn().mockResolvedValue([{ exists: opts.tablesExist ?? false }]),
  };
}

// 17 Nov, part 3: no "Missing Topic Coverage" -- topical_coverage_gaps isn't a measurement (every vertical's
// library, matched by unexpanded template, "no content" by default; "improves N prompts" counted library prompts).
describe("citation-failure-diagnosis", () => {
  const GAP = {
    topicCluster: "emergency_plumbing",
    topicLabel: "Emergency Plumbing",
    vertical: "tradies",
    brandHasContent: false,
    crossPromptImpact: 3,
    competitorCoverage: [{ domain: "comp.com.au", depth: 80 }],
  };

  it("returns CitationDiagnosis[]; never a topical-gap diagnosis, whatever topical_coverage_gaps holds", {
    timeout: 15000,
  }, async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");
    const result = await diagnose(makeMockTx({ gaps: [GAP] }) as never, { brandId: "brand-1" });
    expect(result).toBeInstanceOf(Array);
    expect(result.some((d) => d.patternKey === "missing_topic_coverage")).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /Fixing this could improve|No content found for topic/,
    );
  });

  it("no completed audit: no diagnosis at all (no error)", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");
    const result = await diagnose(makeMockTx({ gaps: [GAP] }) as never, { brandId: "brand-1" });
    expect(result).toEqual([]);
  });
});

/**
 * Task #46 (5th follow-up), Part B: the new "brand_domain_not_cited"
 * diagnosis -- replaces the dead "no_brand_owned_citations" branch.
 * Mocked here (the citedSources-domain-comparison logic itself is pure
 * JS over whatever citations.select() resolves to); run_number/organic
 * SQL filtering is proven separately against a real DB, since a mock
 * can't simulate Postgres actually applying a WHERE clause.
 */
describe("checkBrandDomainNotCited (via diagnose) -- the new honest 'your website isn't cited' check", () => {
  function citationRow(
    engine: string,
    citedSources: Array<{ domain: string; url: string; origin?: string }>,
  ) {
    return { engine, citedSources };
  }

  it("fires when real sources were cited across engines and none is the brand's domain", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      latestAudit: { id: "audit-1", auditNumber: 50 },
      brandDomain: "bondiplumbing.com.au",
      citationRows: [
        citationRow("claude", [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }]),
        citationRow("perplexity", [
          { domain: "oneflare.com.au", url: "https://oneflare.com.au/b", origin: "retrieved" },
        ]),
      ],
    });

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });
    const d = result.find((r) => r.patternKey === "brand_domain_not_cited");

    expect(d).toBeDefined();
    // 17 Nov, part 3: answers, as the audit page counts them, and which audit -- it counted links.
    expect(d?.evidence).toContain(
      "In audit #50, 2 of 2 everyday answers linked a source (2 links in all, across 2 engines), and none was your website.",
    );
    expect(d?.evidence).toContain("Claude: 1 source (Recalled)");
    expect(d?.evidence).toContain("Perplexity: 1 source (Retrieved)");
    // Mixed retrieved+recalled -- both origin-specific remediations apply.
    expect(d?.remediation).toContain("engines that search live");
    expect(d?.remediation).toContain(
      "Get listed and mentioned on the sites these engines already cite",
    );
  });

  // Task #46 follow-up: the remediation used to be one static line for
  // every engine regardless of how it sourced its citations -- now
  // origin-aware (retrieved vs recalled), since on-site schema changes
  // can't move an engine that answered from training data.
  describe("remediation is origin-aware", () => {
    it("recommends on-site schema/structure when every engine retrieved live, and nothing recalled-specific", async () => {
      const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

      const mockTx = makeMockTx({
        latestAudit: { id: "audit-1", auditNumber: 50 },
        brandDomain: "bondiplumbing.com.au",
        citationRows: [
          citationRow("perplexity", [
            { domain: "oneflare.com.au", url: "https://oneflare.com.au/b", origin: "retrieved" },
          ]),
        ],
      });

      const result = await diagnose(mockTx as never, { brandId: "brand-1" });
      const d = result.find((r) => r.patternKey === "brand_domain_not_cited");

      expect(d?.remediation).toContain("engines that search live (like Perplexity) pick your site");
      expect(d?.remediation).not.toContain("Get listed and mentioned on the sites");
    });

    it("recommends getting listed on cited sources when every engine recalled from memory, and nothing retrieved-specific", async () => {
      const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

      const mockTx = makeMockTx({
        latestAudit: { id: "audit-1", auditNumber: 50 },
        brandDomain: "bondiplumbing.com.au",
        citationRows: [
          citationRow("claude", [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }]),
        ],
      });

      const result = await diagnose(mockTx as never, { brandId: "brand-1" });
      const d = result.find((r) => r.patternKey === "brand_domain_not_cited");

      expect(d?.remediation).toContain(
        "Get listed and mentioned on the sites these engines already cite",
      );
      expect(d?.remediation).not.toContain("engines that search live");
    });
  });

  // Task #46 follow-up: "Chatgpt" (naive capitalize()) vs the real
  // display name "ChatGPT" -- the one case the generic capitalize()
  // helper got wrong among the four engines.
  it("names ChatGPT correctly in the per-engine evidence, not 'Chatgpt'", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      latestAudit: { id: "audit-1", auditNumber: 50 },
      brandDomain: "bondiplumbing.com.au",
      citationRows: [
        citationRow("chatgpt", [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }]),
      ],
    });

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });
    const d = result.find((r) => r.patternKey === "brand_domain_not_cited");

    expect(d?.evidence).toContain("ChatGPT: 1 source (Recalled)");
    expect(d?.evidence).not.toContain("Chatgpt");
  });

  it("does NOT fire when the brand's own domain was cited", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      latestAudit: { id: "audit-1", auditNumber: 50 },
      brandDomain: "bondiplumbing.com.au",
      citationRows: [
        citationRow("claude", [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }]),
        citationRow("perplexity", [
          { domain: "bondiplumbing.com.au", url: "https://bondiplumbing.com.au/" },
        ]),
      ],
    });

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });
    expect(result.find((r) => r.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });

  it("matches a www./subdomain variant of the brand's domain -- still does NOT fire", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      latestAudit: { id: "audit-1", auditNumber: 50 },
      brandDomain: "bondiplumbing.com.au",
      citationRows: [
        citationRow("claude", [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }]),
        citationRow("chatgpt", [
          { domain: "www.bondiplumbing.com.au", url: "https://www.bondiplumbing.com.au/contact" },
        ]),
      ],
    });

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });
    expect(result.find((r) => r.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });

  it("does NOT fire when the brand has no domain on record -- never claims 'not cited' when it can't check", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      latestAudit: { id: "audit-1", auditNumber: 50 },
      brandDomain: undefined, // brands.domain is null
      citationRows: [
        citationRow("claude", [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }]),
      ],
    });

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });
    expect(result.find((r) => r.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });

  it("does NOT fire when engines cited nothing at all -- the 'cited no sources' line covers that instead", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      latestAudit: { id: "audit-1", auditNumber: 50 },
      brandDomain: "bondiplumbing.com.au",
      citationRows: [citationRow("gemini", []), citationRow("claude", [])],
    });

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });
    expect(result.find((r) => r.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });

  it("does NOT fire when every citedSources entry fails domain validation (junk only)", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      latestAudit: { id: "audit-1", auditNumber: 50 },
      brandDomain: "bondiplumbing.com.au",
      citationRows: [
        citationRow("gemini", [{ domain: "192.168.1.1", url: "https://192.168.1.1/x" }]),
      ],
    });

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });
    expect(result.find((r) => r.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });

  it("never fires when there's no completed audit at all", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({ brandDomain: "bondiplumbing.com.au" }); // no latestAudit
    const result = await diagnose(mockTx as never, { brandId: "brand-1" });
    expect(result.find((r) => r.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });
});

// 17 Nov, part 3: "X is cited N times in prompts where your brand is absent" came from comparison_prompt_results
// (head-to-head prompts that named the competitor: no citation, nothing about the brand being absent). diagnose() no
// longer reads that table; a competitor diagnosis comes only from the audit's own answers (a competitor's website
// linked in everyday answers that didn't name the brand: tests/integration/brand-pages-agree-with-audit.integration).
describe("comparison_prompt_results -- never a 'cited instead' claim", () => {
  it("diagnose() runs no comparison_prompt_results query", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");
    const mockTx = makeMockTx({
      latestAudit: { id: "audit-1", auditNumber: 50 },
      tablesExist: true,
    });
    const result = await diagnose(mockTx as never, { brandId: "brand-1" });
    expect(result.some((r) => r.patternKey === "competitor_cited_instead")).toBe(false);
    expect(mockTx.execute).not.toHaveBeenCalled();
  });
});
