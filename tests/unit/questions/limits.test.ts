/**
 * S03 part 1 (LLD 7.6, 8.3.5; D3, D4, D5, D-QI-BR, D-QI8, D1; appendix E): every plan's question entitlements in
 * lib/pricing/tiers.ts, and lib/questions/limits.ts's arithmetic and refusal -- the 402 sentence word for word.
 */
import { describe, expect, it } from "vitest";
import { TIER_DEFINITIONS } from "@/lib/pricing/tiers";
import {
  assertQuestionLimits,
  countSet,
  MIN_EVERYDAY_QUESTIONS,
  QUESTIONS_PER_PACK,
  QuestionLimitError,
  questionLimitBody,
  questionLimitError,
  questionLimitMessage,
  questionLimitsFor,
} from "@/lib/questions/limits";

describe("every plan's question entitlements (tiers.ts)", () => {
  it("matches LLD 7.6 and 8.3.5, plan by plan", () => {
    const table = Object.fromEntries(
      TIER_DEFINITIONS.map((t) => [
        t.key,
        [
          t.includedScoredQuestions,
          t.maxBrandedQuestions,
          t.canWriteQuestions,
          t.reachesAllowed,
          t.customBusinessTypes,
          t.reportCuration,
          t.questionPacks,
        ],
      ]),
    );
    // included, branded, write own, reaches, custom types, report curation, packs
    expect(table).toEqual({
      free: [10, 5, false, 1, 0, false, false],
      starter: [10, 5, false, 1, 0, false, false],
      growth: [10, 5, true, 2, 5, false, true],
      agency: [10, 5, true, 4, 20, true, true],
      agency_pro: [10, 5, true, 4, -1, true, true],
      enterprise: [10, 5, true, 4, -1, true, true],
    });
  });
});

describe("questionLimitsFor", () => {
  it("adds 10 everyday questions per pack on a plan with packs", () => {
    expect(QUESTIONS_PER_PACK).toBe(10);
    expect(questionLimitsFor("growth", 0).everydayAllowed).toBe(10);
    expect(questionLimitsFor("growth", 1).everydayAllowed).toBe(20);
    expect(questionLimitsFor("agency_pro", 3)).toMatchObject({ packs: 3, everydayAllowed: 40 });
  });

  it("counts no packs on Free or Starter, and never a negative or fractional one", () => {
    expect(questionLimitsFor("free", 2)).toMatchObject({ packs: 0, everydayAllowed: 10 });
    expect(questionLimitsFor("starter", 5)).toMatchObject({ packs: 0, everydayAllowed: 10 });
    expect(questionLimitsFor("agency", -2)).toMatchObject({ packs: 0, everydayAllowed: 10 });
    expect(questionLimitsFor("agency", 1.7)).toMatchObject({ packs: 1, everydayAllowed: 20 });
  });

  it("an unknown plan reads as Free; the floor is 5 everyday questions", () => {
    expect(questionLimitsFor("no_such_plan", 1)).toMatchObject({
      plan: "free",
      everydayAllowed: 10,
      canWriteQuestions: false,
    });
    expect(MIN_EVERYDAY_QUESTIONS).toBe(5);
    expect(questionLimitsFor("growth", 0).everydayMin).toBe(5);
  });
});

describe("the refusal: 402 question_limit with appendix E's sentence", () => {
  it("is appendix E's plan-limit copy, word for word", () => {
    expect(questionLimitMessage(10)).toBe(
      "Your plan includes 10 everyday questions per brand. Remove one, or add a question pack.",
    );
    const e = new QuestionLimitError(20);
    expect(e).toMatchObject({ code: "question_limit", status: 402, limit: 20 });
    expect(e.message).toBe(
      "Your plan includes 20 everyday questions per brand. Remove one, or add a question pack.",
    );
    expect(questionLimitBody(e)).toEqual({
      error: "question_limit",
      message:
        "Your plan includes 20 everyday questions per brand. Remove one, or add a question pack.",
      limit: 20,
    });
  });

  it("comes only above the allowed count, never at it; questions naming the business don't count", () => {
    const limits = questionLimitsFor("agency", 0);
    expect(questionLimitError(limits, { everyday: 10, branded: 5 })).toBeNull();
    expect(questionLimitError(limits, { everyday: 11, branded: 0 })?.limit).toBe(10);
    expect(() => assertQuestionLimits(limits, { everyday: 10, branded: 5 })).not.toThrow();
    expect(() => assertQuestionLimits(limits, { everyday: 11, branded: 3 })).toThrow(
      QuestionLimitError,
    );
  });

  it("countSet counts a set's items by kind", () => {
    expect(
      countSet([
        { kind: "everyday" },
        { kind: "branded" },
        { kind: "everyday" },
        { kind: "everyday" },
      ]),
    ).toEqual({ everyday: 3, branded: 1 });
  });
});
