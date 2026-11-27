/**
 * S04 part 0e (LLD amendment 94; contract v1.9 P07.split): the split's two parts, each printed on its own line.
 */
import { describe, expect, it } from "vitest";
import { type QuestionMix, questionSplitLine, questionSplitParts } from "@/lib/questions/mix";

const mix = (split: QuestionMix["split"]): QuestionMix => ({
  total: 13,
  everyday: 10,
  branded: 3,
  agency: 3,
  nonAgency: 7,
  allOriginal: false,
  agencyName: "Possum Marketing and Digital Growth Partners of Greater Western Sydney",
  split,
});

describe("questionSplitParts", () => {
  it("one part per source, the agency's name whole", () => {
    expect(questionSplitParts(mix({ ai: { m: 4, n: 28 }, agency: { m: 2, n: 12 } }))).toEqual([
      "AI-suggested questions: 14% (4 of 28)",
      "Written by Possum Marketing and Digital Growth Partners of Greater Western Sydney: 17% (2 of 12)",
    ]);
  });
  it("none without a split; the joined line is the same text as before", () => {
    expect(questionSplitParts(mix(null))).toBeNull();
    expect(questionSplitLine(mix({ ai: { m: 0, n: 0 }, agency: { m: 1, n: 4 } }))).toBe(
      "AI-suggested questions: 0% (0 of 0) · Written by Possum Marketing and Digital Growth Partners of Greater Western Sydney: 25% (1 of 4)",
    );
  });
});
