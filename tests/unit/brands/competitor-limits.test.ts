import { describe, expect, it } from "vitest";
import {
  MAX_COMPARISON_COMPETITORS,
  selectComparisonCompetitors,
} from "@/lib/brands/competitor-limits";

describe("selectComparisonCompetitors", () => {
  it("returns all competitors when under the cap", () => {
    expect(selectComparisonCompetitors(["A", "B"])).toEqual(["A", "B"]);
  });

  it("returns all competitors when exactly at the cap", () => {
    const five = ["A", "B", "C", "D", "E"];
    expect(selectComparisonCompetitors(five)).toEqual(five);
  });

  it("returns only the first MAX_COMPARISON_COMPETITORS when over the cap -- oldest-added (lowest index) first", () => {
    const seven = ["A", "B", "C", "D", "E", "F", "G"];
    const result = selectComparisonCompetitors(seven);
    expect(result).toEqual(["A", "B", "C", "D", "E"]);
    expect(result).toHaveLength(MAX_COMPARISON_COMPETITORS);
  });

  it("is deterministic -- same input always produces the same output, in the same order", () => {
    const input = ["Z", "Y", "X", "W", "V", "U"];
    const first = selectComparisonCompetitors(input);
    const second = selectComparisonCompetitors(input);
    expect(first).toEqual(second);
    expect(first).toEqual(["Z", "Y", "X", "W", "V"]);
  });

  it("returns an empty array for an empty input, not undefined or a throw", () => {
    expect(selectComparisonCompetitors([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = ["A", "B", "C", "D", "E", "F"];
    const original = [...input];
    selectComparisonCompetitors(input);
    expect(input).toEqual(original);
  });
});

describe("inngest/functions/run-comparison-prompts.ts wires the cap in", () => {
  it("calls selectComparisonCompetitors on brand.competitors, not a raw slice", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve("inngest/functions/run-comparison-prompts.ts"),
      "utf-8",
    );
    expect(source).toContain(
      'import { selectComparisonCompetitors } from "@/lib/brands/competitor-limits"',
    );
    expect(source).toContain("selectComparisonCompetitors(brand.competitors)");
  });
});
