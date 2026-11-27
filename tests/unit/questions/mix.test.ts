/**
 * S03 part 6 (LLD 8.3.3, D2; contract P07.mix, P07.split; appendix E): the question mix line and the split line, word
 * for word -- zero parts left out, singulars, the untouched brand's "(all from the original set)", and the split only
 * when both kinds were asked.
 */
import { describe, expect, it } from "vitest";
import { type QuestionMix, questionMixLine, questionSplitLine } from "@/lib/questions/mix";

const mix = (over: Partial<QuestionMix>): QuestionMix => ({
  total: 13,
  everyday: 10,
  branded: 3,
  agency: 0,
  nonAgency: 10,
  allOriginal: true,
  agencyName: "Possum Marketing",
  split: null,
  ...over,
});

describe("the mix line", () => {
  it("an untouched brand: all from the original set", () => {
    expect(questionMixLine(mix({}))).toBe(
      "13 questions: 10 everyday (all from the original set) and 3 that name the business.",
    );
  });

  it("7 AI-suggested and 3 written by the agency (appendix E's template)", () => {
    expect(questionMixLine(mix({ agency: 3, nonAgency: 7, allOriginal: false }))).toBe(
      "13 questions: 10 everyday (7 AI-suggested, 3 written by Possum Marketing) and 3 that name the business.",
    );
  });

  it("zero parts left out; singulars", () => {
    expect(questionMixLine(mix({ total: 10, branded: 0 }))).toBe(
      "10 questions: 10 everyday (all from the original set).",
    );
    expect(questionMixLine(mix({ total: 11, branded: 1 }))).toBe(
      "11 questions: 10 everyday (all from the original set) and 1 that names the business.",
    );
    expect(questionMixLine(mix({ agency: 10, nonAgency: 0, allOriginal: false }))).toBe(
      "13 questions: 10 everyday (10 written by Possum Marketing) and 3 that name the business.",
    );
    expect(questionMixLine(mix({ allOriginal: false }))).toBe(
      "13 questions: 10 everyday (10 AI-suggested) and 3 that name the business.",
    );
  });
});

describe("the split line (D2)", () => {
  it("only when both kinds were asked; each kind over its own answers", () => {
    expect(questionSplitLine(mix({}))).toBeNull();
    expect(
      questionSplitLine(
        mix({ agency: 3, nonAgency: 7, split: { ai: { m: 6, n: 20 }, agency: { m: 1, n: 10 } } }),
      ),
    ).toBe("AI-suggested questions: 30% (6 of 20) · Written by Possum Marketing: 10% (1 of 10)");
  });

  it("a kind with no successful answer reads 0% (0 of 0)", () => {
    expect(
      questionSplitLine(
        mix({ agency: 1, nonAgency: 9, split: { ai: { m: 2, n: 9 }, agency: { m: 0, n: 0 } } }),
      ),
    ).toBe("AI-suggested questions: 22% (2 of 9) · Written by Possum Marketing: 0% (0 of 0)");
  });
});
