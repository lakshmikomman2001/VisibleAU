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
function makeMockTx(opts: {
  gaps?: unknown[];
  latestAudit?: { id: string } | undefined;
  brandDomain?: string | undefined;
  citationRows?: unknown[];
  tablesExist?: boolean;
} = {}) {
  const gaps = opts.gaps ?? [];
  const auditRows = opts.latestAudit ? [opts.latestAudit] : [];
  const brandRows = opts.brandDomain !== undefined ? [{ domain: opts.brandDomain }] : [{ domain: null }];
  const citationRows = opts.citationRows ?? [];

  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === topicalCoverageGaps) {
          return { where: () => ({ orderBy: () => ({ limit: () => Promise.resolve(gaps) }) }) };
        }
        if (table === audits) {
          return { where: () => ({ orderBy: () => ({ limit: () => Promise.resolve(auditRows) }) }) };
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

describe("citation-failure-diagnosis", () => {
  it(
    "returns CitationDiagnosis[] matching the component type shape",
    { timeout: 15000 },
    async () => {
      const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

      const mockTx = makeMockTx({
        gaps: [
          {
            topicCluster: "emergency_plumbing",
            topicLabel: "Emergency Plumbing",
            vertical: "tradies",
            brandHasContent: false,
            crossPromptImpact: 3,
            competitorCoverage: [{ domain: "comp.com.au", depth: 80 }],
          },
        ],
      });

      const result = await diagnose(mockTx as never, {
        brandId: "brand-1",
      });

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);

      const d = result[0];
      expect(d).toHaveProperty("patternKey");
      expect(d).toHaveProperty("severity");
      expect(d).toHaveProperty("evidence");
      expect(["high", "medium", "low"]).toContain(d.severity);
      expect(d.patternKey).toBe("missing_topic_coverage");
    },
  );

  it("diagnoses from topical gaps alone when no completed audit exists (no error)", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      gaps: [
        {
          topicCluster: "test_topic",
          topicLabel: "Test Topic",
          vertical: "saas",
          brandHasContent: false,
          crossPromptImpact: 2,
          competitorCoverage: [],
        },
      ],
      // No latestAudit -- both audit-scoped diagnoses skip entirely.
    });

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((d) => d.patternKey === "missing_topic_coverage")).toBe(true);
  });

  it("diagnoses from topical gaps alone when S5/S7 tables absent (no error)", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      gaps: [
        {
          topicCluster: "test_topic",
          topicLabel: "Test Topic",
          vertical: "saas",
          brandHasContent: false,
          crossPromptImpact: 2,
          competitorCoverage: [],
        },
      ],
      latestAudit: { id: "audit-1" },
      brandDomain: "example.com.au",
      citationRows: [],
      tablesExist: false,
    });

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((d) => d.patternKey === "missing_topic_coverage")).toBe(true);
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
  function citationRow(engine: string, citedSources: Array<{ domain: string; url: string; origin?: string }>) {
    return { engine, citedSources };
  }

  it("fires when real sources were cited across engines and none is the brand's domain", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      latestAudit: { id: "audit-1" },
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
    expect(d?.evidence).toContain("AI engines cited 2 sources across 2 engines, and none was your website.");
    expect(d?.evidence).toContain("Claude: 1 source (Recalled)");
    expect(d?.evidence).toContain("Perplexity: 1 source (Retrieved)");
  });

  it("does NOT fire when the brand's own domain was cited", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      latestAudit: { id: "audit-1" },
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
      latestAudit: { id: "audit-1" },
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
      latestAudit: { id: "audit-1" },
      brandDomain: undefined, // brands.domain is null
      citationRows: [citationRow("claude", [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }])],
    });

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });
    expect(result.find((r) => r.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });

  it("does NOT fire when engines cited nothing at all -- the 'cited no sources' line covers that instead", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      latestAudit: { id: "audit-1" },
      brandDomain: "bondiplumbing.com.au",
      citationRows: [citationRow("gemini", []), citationRow("claude", [])],
    });

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });
    expect(result.find((r) => r.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });

  it("does NOT fire when every citedSources entry fails domain validation (junk only)", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = makeMockTx({
      latestAudit: { id: "audit-1" },
      brandDomain: "bondiplumbing.com.au",
      citationRows: [citationRow("gemini", [{ domain: "192.168.1.1", url: "https://192.168.1.1/x" }])],
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

/**
 * A drizzle `sql` template's queryChunks mixes literal-text chunks
 * (objects shaped `{ value: [string] }`) with raw interpolated param
 * values (plain strings/numbers) -- this reconstructs just the literal
 * SQL text, skipping params, so tests can assert on query shape
 * without a real Postgres connection.
 */
function queryChunksToText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] })?.queryChunks ?? [];
  return chunks
    .map((c) => {
      const value = (c as { value?: unknown })?.value;
      return Array.isArray(value) ? value.join("") : "";
    })
    .join("");
}

describe("comparison_prompt_results diagnosis -- the competitor_cited column bug", () => {
  it("no longer throws 42703 and uses competitor_mentioned, scoped to the latest audit", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    let call = 0;
    const executeSpy = vi.fn().mockImplementation(() => {
      call++;
      // Call 1 is always tableExists("comparison_prompt_results"); call 2
      // is the comparison_prompt_results aggregate query.
      if (call === 1) return Promise.resolve([{ exists: true }]);
      return Promise.resolve([{ competitor_domain: "rivalplumbing.com.au", cited_count: "2" }]);
    });

    const mockTx = {
      select: () => ({
        from: (table: unknown) => {
          if (table === topicalCoverageGaps) {
            return { where: () => ({ orderBy: () => ({ limit: () => Promise.resolve([]) }) }) };
          }
          if (table === audits) {
            return { where: () => ({ orderBy: () => ({ limit: () => Promise.resolve([{ id: "audit-1" }]) }) }) };
          }
          if (table === brands) return { where: () => Promise.resolve([{ domain: null }]) };
          if (table === citations) return { where: () => Promise.resolve([]) };
          throw new Error("unexpected table");
        },
      }),
      execute: executeSpy,
    };

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });

    const compDiagnosis = result.find((r) => r.patternKey === "competitor_cited_instead");
    expect(compDiagnosis).toBeDefined();
    expect(compDiagnosis?.competitorCited).toBe("rivalplumbing.com.au");

    // The fixed query references competitor_mentioned and audit_id,
    // never the non-existent competitor_cited column.
    const calls = executeSpy.mock.calls.map((c) => queryChunksToText(c[0]));
    const compQuery = calls.find((c) => c.includes("comparison_prompt_results"));
    expect(compQuery).toContain("competitor_mentioned");
    expect(compQuery).toContain("audit_id");
    expect(compQuery).not.toContain("competitor_cited");
  });
});
