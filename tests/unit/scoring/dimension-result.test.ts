import { describe, expect, it } from "vitest";
import { resolveDimension, resolveHeadline } from "@/lib/scoring/dimension-result";

const CI0 = { lower: 0, upper: 0 };

describe("resolveDimension", () => {
  it("0 mention rows: insufficient_data, reason no_mentions", () => {
    const result = resolveDimension(0, CI0, 0);
    expect(result).toEqual({ status: "insufficient_data", reason: "no_mentions" });
  });

  it("some mention rows: scored, with the given value and CI", () => {
    const ci = { lower: 10, upper: 30 };
    const result = resolveDimension(20, ci, 5);
    expect(result).toEqual({ status: "scored", value: 20, ci });
  });
});

// Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
// resolveComposite (the weighted 5-dimension blend) is gone -- see
// lib/scoring/dimension-result.ts's top comment. resolveHeadline
// replaces Frequency's own old alwaysScored:true rule with a gate on
// SAMPLE size (successful organic answers) instead of mention count.
describe("resolveHeadline", () => {
  it("0 successful answers: insufficient_data, reason no_answers", () => {
    const result = resolveHeadline(0, { lower: 0, upper: 15 }, 0);
    expect(result).toEqual({ status: "insufficient_data", reason: "no_answers" });
  });

  it("at least 1 successful answer: scored, even with 0 mentions (0% IS a real measurement)", () => {
    const result = resolveHeadline(0, { lower: 0, upper: 15 }, 37);
    expect(result).toEqual({ status: "scored", value: 0, ci: { lower: 0, upper: 15 } });
  });

  it("scored with real mentions: the given value and CI, unchanged", () => {
    const ci = { lower: 8, upper: 31 };
    const result = resolveHeadline(16.2, ci, 37);
    expect(result).toEqual({ status: "scored", value: 16.2, ci });
  });
});
