import { describe, expect, it } from "vitest";
import {
  extractCitations,
  mergeCitedSources,
  resolveCitationOrigin,
  toRegistrableDomain,
} from "@/lib/audit/extract-citations";

describe("extractCitations", () => {
  it("extracts markdown link URLs", () => {
    const r = extractCitations("See [Bondi Plumbing](https://bondiplumbing.com.au) for details.");
    expect(r).toContainEqual(expect.objectContaining({ domain: "bondiplumbing.com.au" }));
  });
  it("extracts bare https URLs", () => {
    const r = extractCitations("Visit https://bondiplumbing.com.au for a quote.");
    expect(r).toContainEqual(expect.objectContaining({ domain: "bondiplumbing.com.au" }));
  });
  it("extracts domain-only .com.au references", () => {
    const r = extractCitations("You can also try bondiplumbing.com.au directly.");
    expect(r).toContainEqual(expect.objectContaining({ domain: "bondiplumbing.com.au" }));
  });
  it("deduplicates same domain across formats", () => {
    const r = extractCitations("[Link](https://bondiplumbing.com.au) and bondiplumbing.com.au");
    expect(r.filter((s) => s.domain === "bondiplumbing.com.au")).toHaveLength(1);
  });
  it("empty response → empty array", () => {
    expect(extractCitations("")).toEqual([]);
  });
});

/**
 * Task #43: Perplexity-style answers like "the strongest options are
 * **hipages**, **Airtasker**…[1][3]" have nothing extractCitations()
 * can find in the text -- the real URLs live in the provider's own
 * structured citations field. mergeCitedSources is how those get back
 * into the same citedSources shape every downstream consumer expects.
 */
describe("mergeCitedSources", () => {
  it("structured URLs with nothing extractable from text still produce real sources", () => {
    const extracted = extractCitations("The strongest options are hipages and Airtasker. [1][3]");
    expect(extracted).toEqual([]); // confirms the text truly has nothing to extract

    const merged = mergeCitedSources(extracted, [
      "https://hipages.com.au/connect/plumber",
      "https://www.airtasker.com/tasks/plumbing",
    ]);

    expect(merged).toEqual([
      { domain: "hipages.com.au", url: "https://hipages.com.au/connect/plumber", origin: "retrieved" },
      { domain: "airtasker.com", url: "https://www.airtasker.com/tasks/plumbing", origin: "retrieved" },
    ]);
  });

  it("structured URLs are listed first (more reliable -- wins as classify-citation-sources.ts's primary source)", () => {
    const extracted = extractCitations("See bondiplumbing.com.au for details.");
    const merged = mergeCitedSources(extracted, ["https://hipages.com.au/connect/plumber"]);

    expect(merged[0].domain).toBe("hipages.com.au");
    expect(merged[1].domain).toBe("bondiplumbing.com.au");
  });

  it("de-duplicates by domain between structured and extracted", () => {
    const extracted = extractCitations("Visit https://hipages.com.au/connect/plumber directly.");
    const merged = mergeCitedSources(extracted, ["https://hipages.com.au/connect/plumber"]);

    expect(merged).toHaveLength(1);
  });

  it("undefined structuredUrls is a no-op -- just the extracted sources", () => {
    const extracted = extractCitations("See bondiplumbing.com.au for details.");
    expect(mergeCitedSources(extracted, undefined)).toEqual(extracted);
  });

  it("malformed structured URLs are skipped, not thrown", () => {
    const merged = mergeCitedSources([], ["not-a-valid-url", "https://hipages.com.au/connect/plumber"]);
    expect(merged).toEqual([
      { domain: "hipages.com.au", url: "https://hipages.com.au/connect/plumber", origin: "retrieved" },
    ]);
  });
});

/**
 * Task #45: "retrieved" vs "recalled" origin tagging -- extracted
 * (text-pattern) sources are always "recalled"; structured sources are
 * always "retrieved". resolveCitationOrigin infers an origin for
 * pre-task-#45 rows that have no per-entry origin at all.
 */
describe("origin tagging", () => {
  it("extractCitations always tags its own output 'recalled'", () => {
    const sources = extractCitations("See bondiplumbing.com.au and https://hipages.com.au/a");
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s.origin === "recalled")).toBe(true);
  });

  it("mergeCitedSources tags structured URLs 'retrieved' and extracted ones stay 'recalled'", () => {
    const extracted = extractCitations("See bondiplumbing.com.au for details.");
    const merged = mergeCitedSources(extracted, ["https://hipages.com.au/connect/plumber"]);

    expect(merged.find((s) => s.domain === "hipages.com.au")?.origin).toBe("retrieved");
    expect(merged.find((s) => s.domain === "bondiplumbing.com.au")?.origin).toBe("recalled");
  });
});

describe("resolveCitationOrigin -- legacy (pre-task-#45) entries with no origin field", () => {
  it("returns the entry's own origin when present, regardless of engine", () => {
    expect(resolveCitationOrigin({ origin: "recalled" }, "perplexity")).toBe("recalled");
    expect(resolveCitationOrigin({ origin: "retrieved" }, "chatgpt")).toBe("retrieved");
  });

  it("infers 'retrieved' for a citation-supplying engine (perplexity) with no origin field", () => {
    expect(resolveCitationOrigin({}, "perplexity")).toBe("retrieved");
  });

  it("infers 'recalled' for engines that never supply structured citations", () => {
    expect(resolveCitationOrigin({}, "chatgpt")).toBe("recalled");
    expect(resolveCitationOrigin({}, "claude")).toBe("recalled");
    expect(resolveCitationOrigin({}, "gemini")).toBe("recalled");
  });
});

describe("toRegistrableDomain", () => {
  it("strips a subdomain down to the registrable AU-style domain", () => {
    expect(toRegistrableDomain("blog.hipages.com.au")).toBe("hipages.com.au");
    expect(toRegistrableDomain("a.b.hipages.com.au")).toBe("hipages.com.au");
  });

  it("strips a subdomain down to the registrable generic domain", () => {
    expect(toRegistrableDomain("blog.example.com")).toBe("example.com");
  });

  it("leaves an already-registrable domain unchanged", () => {
    expect(toRegistrableDomain("hipages.com.au")).toBe("hipages.com.au");
    expect(toRegistrableDomain("example.com")).toBe("example.com");
  });

  it("strips www. first", () => {
    expect(toRegistrableDomain("www.hipages.com.au")).toBe("hipages.com.au");
  });
});
