import { describe, expect, it } from "vitest";
import { cleanSubQueries } from "@/lib/visibility/clean-sub-queries";

describe("cleanSubQueries (regression: bug 5b — LLM preamble/numbering/markdown leaked as rows)", () => {
  it("drops preamble line 'Certainly! Here are N ...'", () => {
    const raw = "Certainly! Here are 12 search sub-queries:\nbest plumbers Melbourne\nemergency plumber Melbourne";
    const out = cleanSubQueries(raw, 12);
    expect(out[0]).toBe("best plumbers Melbourne");
    expect(out).not.toContain("Certainly! Here are 12 search sub-queries:");
  });

  it("drops 'Here are' / 'Below are' / 'Sure' / 'Of course' preambles", () => {
    const cases = [
      "Here are the sub-queries for your brand:",
      "Sure, I can help with that",
      "Below are 10 queries",
      "Of course! Here you go:",
      "These are the top search intents:",
    ];
    for (const preamble of cases) {
      const out = cleanSubQueries(`${preamble}\nreal query here`, 12);
      expect(out).toEqual(["real query here"]);
    }
  });

  it("strips leading numbering '1. ' / '2) '", () => {
    const out = cleanSubQueries("1. best plumbers Melbourne\n2) emergency plumber Melbourne\n3.another query", 12);
    expect(out[0]).toBe("best plumbers Melbourne");
    expect(out[1]).toBe("emergency plumber Melbourne");
    expect(out[2]).toBe("another query");
  });

  it("strips markdown ### prefix (content remains)", () => {
    const out = cleanSubQueries("### Reputation & Reviews\nbest plumbers Melbourne", 12);
    expect(out).toContain("Reputation & Reviews");
    expect(out).toContain("best plumbers Melbourne");
  });

  it("drops --- horizontal rules", () => {
    const out = cleanSubQueries("query one\n---\nquery two\n----\nquery three", 12);
    expect(out.join(" ")).not.toContain("---");
    expect(out).toContain("query one");
    expect(out).toContain("query two");
    expect(out).toContain("query three");
  });

  it("strips ** bold markers", () => {
    const out = cleanSubQueries("**Melbourne plumbing services**", 12);
    expect(out[0]).not.toContain("**");
    expect(out[0]).toContain("Melbourne plumbing services");
  });

  it("strips wrapping quotes from lines", () => {
    const out = cleanSubQueries('"best plumbers Melbourne"\n"emergency plumber Melbourne"', 12);
    expect(out).toEqual(["best plumbers Melbourne", "emergency plumber Melbourne"]);
  });

  it("strips wrapping backticks from lines", () => {
    const out = cleanSubQueries("`best plumbers Melbourne`\n`emergency plumber`", 12);
    expect(out).toEqual(["best plumbers Melbourne", "emergency plumber"]);
  });

  it("strips bullet markers (- and •)", () => {
    const out = cleanSubQueries("- best plumbers Melbourne\n• emergency plumber Melbourne\n* star bullet item", 12);
    expect(out[0]).toBe("best plumbers Melbourne");
    expect(out[1]).toBe("emergency plumber Melbourne");
  });

  it("drops lines ending with colon (section labels)", () => {
    const out = cleanSubQueries("Service queries:\nbest plumber near me\nReputation queries:\ntop rated plumber", 12);
    expect(out).toEqual(["best plumber near me", "top rated plumber"]);
  });

  it("caps at max and never pads with junk", () => {
    const raw = Array.from({ length: 20 }, (_, i) => `query number ${i + 1}`).join("\n");
    expect(cleanSubQueries(raw, 12)).toHaveLength(12);
    expect(cleanSubQueries(raw, 5)).toHaveLength(5);
  });

  it("returns [] on empty input", () => {
    expect(cleanSubQueries("", 12)).toEqual([]);
  });

  it("returns [] on whitespace-only input", () => {
    expect(cleanSubQueries("   \n  \n  ", 12)).toEqual([]);
  });

  it("filters lines shorter than 3 chars", () => {
    const out = cleanSubQueries("ab\nvalid query here\nxy", 12);
    expect(out).toEqual(["valid query here"]);
  });

  it("filters lines longer than 120 chars", () => {
    const longLine = "x".repeat(121);
    const out = cleanSubQueries(`valid query here\n${longLine}`, 12);
    expect(out).toEqual(["valid query here"]);
  });

  it("combined real-world LLM output: numbered + bold + preamble", () => {
    const raw = [
      "Here are 5 queries for Metropolitan Plumbing:",
      "1. **best emergency plumber Melbourne**",
      "2. **24 hour plumbing services near me**",
      "3. licensed plumber reviews Melbourne",
      "---",
      "Additional:",
      "4. drain repair cost estimate",
      "5. hot water system replacement",
    ].join("\n");
    const out = cleanSubQueries(raw, 10);
    expect(out).not.toContain("Here are 5 queries for Metropolitan Plumbing:");
    expect(out).toContain("licensed plumber reviews Melbourne");
    expect(out).toContain("drain repair cost estimate");
    expect(out).toContain("hot water system replacement");
    expect(out.join(" ")).not.toContain("---");
  });
});
