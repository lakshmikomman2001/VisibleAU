import { describe, expect, it } from "vitest";
import { extractCitations, mergeCitedSources } from "@/lib/audit/extract-citations";

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
      { domain: "hipages.com.au", url: "https://hipages.com.au/connect/plumber" },
      { domain: "airtasker.com", url: "https://www.airtasker.com/tasks/plumbing" },
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
    expect(merged).toEqual([{ domain: "hipages.com.au", url: "https://hipages.com.au/connect/plumber" }]);
  });
});
