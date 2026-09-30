import { describe, expect, it } from "vitest";
import type { Brand } from "@/db/schema";
import {
  expandPrompt,
  formatCompetitors,
  formatLocation,
  isBrandedPromptTemplate,
} from "@/lib/verticals/expand-prompt";

const mockBrand = { name: "Bondi Plumbing", domain: "bondiplumbing.com.au" } as Brand;
const ctx = {
  brand: mockBrand,
  competitors: ["Eastern Plumbing Co"],
  locations: ["NSW:Bondi", "NSW:Manly"],
};

describe("formatLocation", () => {
  it("transforms STATE:Suburb to Suburb, STATE", () => {
    expect(formatLocation("NSW:Bondi")).toBe("Bondi, NSW");
  });

  it("passes through a value with no colon unchanged", () => {
    expect(formatLocation("Sydney")).toBe("Sydney");
  });

  it("handles 3-level malformed input (nsw:sydney:marrickville)", () => {
    expect(formatLocation("nsw:sydney:marrickville")).toBe("Marrickville, NSW");
  });

  it("uppercases a lowercase state", () => {
    expect(formatLocation("vic:Fitzroy")).toBe("Fitzroy, VIC");
  });

  it("returns fallback for null/undefined/empty", () => {
    expect(formatLocation(null)).toBe("—");
    expect(formatLocation(undefined)).toBe("—");
    expect(formatLocation("")).toBe("—");
  });

  it("uses custom fallback when provided", () => {
    expect(formatLocation(null, "AU")).toBe("AU");
  });
});

describe("formatCompetitors", () => {
  it("joins multiple competitors with comma", () => {
    expect(formatCompetitors(["A", "B"])).toBe("A, B");
  });

  it('returns "other local providers" for empty array', () => {
    expect(formatCompetitors([])).toBe("other local providers");
  });
});

describe("expandPrompt", () => {
  it("replaces {brand}", () => {
    expect(expandPrompt("{brand} is great", ctx)).toEqual(["Bondi Plumbing is great"]);
  });

  it("replaces {domain}", () => {
    expect(expandPrompt("visit {domain}", ctx)).toEqual(["visit bondiplumbing.com.au"]);
  });

  it("replaces {competitors} joined", () => {
    expect(expandPrompt("{brand} vs {competitors}", ctx)).toEqual([
      "Bondi Plumbing vs Eastern Plumbing Co",
    ]);
  });

  it("no placeholders returns [template] unchanged", () => {
    expect(expandPrompt("generic question", ctx)).toEqual(["generic question"]);
  });

  it('{location} expands to N prompts formatted as "Suburb, STATE"', () => {
    const result = expandPrompt("best plumber in {location}", ctx);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("best plumber in Bondi, NSW");
    expect(result[1]).toBe("best plumber in Manly, NSW");
  });

  it("location with no colon passes through unchanged", () => {
    const ctxNoColon = { ...ctx, locations: ["Sydney"] };
    expect(expandPrompt("plumber in {location}", ctxNoColon)).toEqual(["plumber in Sydney"]);
  });

  it('empty competitors falls back to "other local providers"', () => {
    const ctxNoComp = { ...ctx, competitors: [] };
    expect(expandPrompt("{brand} vs {competitors}", ctxNoComp)).toEqual([
      "Bondi Plumbing vs other local providers",
    ]);
  });

  it("empty locations with {location} template returns [] (template skipped)", () => {
    const ctxNoLoc = { ...ctx, locations: [] };
    expect(expandPrompt("plumber in {location}", ctxNoLoc)).toEqual([]);
  });

  it("empty locations with non-location template still returns [expanded]", () => {
    const ctxNoLoc = { ...ctx, locations: [] };
    expect(expandPrompt("{brand} is great", ctxNoLoc)).toEqual(["Bondi Plumbing is great"]);
  });

  it("replaces multiple occurrences of same placeholder", () => {
    expect(expandPrompt("{brand} and {brand}", ctx)).toEqual(["Bondi Plumbing and Bondi Plumbing"]);
  });
});

/**
 * ⚠️ AA — isBrandedPromptTemplate: the one source of truth for whether a
 * prompt guarantees a trivial brand mention. Real au-tradies templates used
 * as fixtures (task Y found 13/124 contain {brand}).
 */
describe("isBrandedPromptTemplate", () => {
  it("templates containing {brand} → true", () => {
    expect(isBrandedPromptTemplate("Is {brand} a reputable tradesperson in Australia?")).toBe(
      true,
    );
    expect(
      isBrandedPromptTemplate("{brand} vs {competitors} — which is better for plumbing?"),
    ).toBe(true);
    expect(isBrandedPromptTemplate("What do customers say about {brand}?")).toBe(true);
  });

  it("neutral templates with no {brand} → false", () => {
    expect(isBrandedPromptTemplate("Who are the best plumbers in {location}?")).toBe(false);
    expect(isBrandedPromptTemplate("Who should I call for a blocked drain in {location}?")).toBe(
      false,
    );
  });

  it("{domain} or {competitors} alone (no {brand}) → false", () => {
    expect(isBrandedPromptTemplate("visit {domain} for more info")).toBe(false);
    expect(isBrandedPromptTemplate("compare {competitors} in {location}")).toBe(false);
  });

  it("a template with no placeholders at all → false", () => {
    expect(isBrandedPromptTemplate("generic question")).toBe(false);
  });
});
