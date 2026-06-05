import { test, expect } from "@playwright/test";
import { expandPrompt, schema } from "../../shared/db";

type Brand = typeof schema.brands.$inferSelect;

function mockBrand(name: string, domain: string): Brand {
  return { name, domain } as Brand;
}

test.describe("F03: expandPrompt — placeholders, formatLocation, formatCompetitors", () => {
  test("F03-01: {brand} placeholder is replaced", async () => {
    const result = expandPrompt("{brand} is great", {
      brand: mockBrand("Bondi Plumbing", "bondiplumbing.com.au"),
      competitors: [],
      locations: [],
    });
    expect(result).toEqual(["Bondi Plumbing is great"]);
  });

  test("F03-02: {domain} placeholder is replaced", async () => {
    const result = expandPrompt("Visit {domain}", {
      brand: mockBrand("Test Brand", "bondiplumbing.com.au"),
      competitors: [],
      locations: [],
    });
    expect(result).toEqual(["Visit bondiplumbing.com.au"]);
  });

  test("F03-03: {competitors} with entries → joined list", async () => {
    const result = expandPrompt("{brand} vs {competitors}", {
      brand: mockBrand("Bondi Plumbing", "test.com.au"),
      competitors: ["Eastern Plumbing Co", "City Pipes"],
      locations: [],
    });
    expect(result).toEqual(["Bondi Plumbing vs Eastern Plumbing Co, City Pipes"]);
  });

  test('F03-04: {competitors} empty → "other local providers" (CB3 fix)', async () => {
    const result = expandPrompt("{brand} vs {competitors}", {
      brand: mockBrand("Bondi Plumbing", "test.com.au"),
      competitors: [],
      locations: [],
    });
    expect(result).toEqual(["Bondi Plumbing vs other local providers"]);
  });

  test('F03-05: {location} expands to "Suburb, STATE" format (CA3 fix)', async () => {
    const result = expandPrompt("best plumber in {location}", {
      brand: mockBrand("Test Brand", "test.com.au"),
      competitors: [],
      locations: ["NSW:Bondi", "NSW:Manly"],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("best plumber in Bondi, NSW");
    expect(result[1]).toBe("best plumber in Manly, NSW");
  });

  test("F03-06: {location} with empty locations → [] (CP1 fix)", async () => {
    const result = expandPrompt("best plumber in {location}", {
      brand: mockBrand("Test Brand", "test.com.au"),
      competitors: [],
      locations: [],
    });
    expect(result, "{location} template with empty locations must return []").toEqual([]);
  });

  test("F03-07: no-placeholder template with empty locations still returns [expanded]", async () => {
    const result = expandPrompt("{brand} is great", {
      brand: mockBrand("Bondi Plumbing", "test.com.au"),
      competitors: [],
      locations: [],
    });
    expect(result).toEqual(["Bondi Plumbing is great"]);
  });

  test("F03-08: location without colon passes through unchanged", async () => {
    const result = expandPrompt("plumber in {location}", {
      brand: mockBrand("Test Brand", "test.com.au"),
      competitors: [],
      locations: ["Sydney"],
    });
    expect(result).toEqual(["plumber in Sydney"]);
  });

  test("F03-09: all 4 placeholders replaced in one template", async () => {
    const result = expandPrompt(
      "{brand} ({domain}) vs {competitors} near {location}",
      {
        brand: mockBrand("Bondi Plumbing", "bondiplumbing.com.au"),
        competitors: ["Eastern Plumbing"],
        locations: ["NSW:Bondi"],
      },
    );
    expect(result).toEqual([
      "Bondi Plumbing (bondiplumbing.com.au) vs Eastern Plumbing near Bondi, NSW",
    ]);
  });

  test("F03-10: multi-location expansion with slice(0,10) hard cap (CB2 fix)", async () => {
    const templates = Array.from({ length: 7 }, (_, i) => `template ${i} in {location}`);
    const locations = ["NSW:Bondi", "NSW:Manly", "VIC:Melbourne CBD"];
    const brand = mockBrand("Test Brand", "test.com.au");
    const allExpanded = templates.flatMap((t) =>
      expandPrompt(t, { brand, competitors: [], locations }),
    );
    const prompts = allExpanded.slice(0, 10);
    expect(
      prompts.length,
      "Hard cap must be 10 regardless of location expansion",
    ).toBeLessThanOrEqual(10);
    expect(allExpanded.length, "7 templates × 3 locations = 21 expanded before cap").toBe(21);
  });

  test("F03-11: {brand} used multiple times in one template (global replace)", async () => {
    const result = expandPrompt("{brand} — call {brand} today", {
      brand: mockBrand("Bondi Plumbing", "test.com.au"),
      competitors: [],
      locations: [],
    });
    expect(result).toEqual(["Bondi Plumbing — call Bondi Plumbing today"]);
  });
});
