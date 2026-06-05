import { describe, expect, it } from "vitest";
import { extractCitations } from "@/lib/audit/extract-citations";

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
