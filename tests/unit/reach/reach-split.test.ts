/**
 * S04 part 6 (LLD 8.4.1; contract P01.reach): the reach card's numbers.
 * - Adding reaches splits the everyday questions evenly, Local at least 4 and taking the remainder: 10 across three
 *   reaches is 4, 3, 3 (the prototype's figure); across two 5, 5; across four 4, 2, 2, 2.
 * - A stepper runs from its minimum (Local 4, others 1; 0 when off) to the limit less the other reaches' questions.
 * - Fewer than 5 questions is a small sample, Local included (the contract's rule, over the prototype's legend).
 */
import { describe, expect, it } from "vitest";
import {
  defaultSplit,
  enabledInOrder,
  isSmallSample,
  smallSampleNote,
  stepperBounds,
  usedQuestions,
} from "@/lib/reach/split";

describe("the reach split", () => {
  it("splits evenly with Local at least 4", () => {
    expect(defaultSplit(["local"], 10)).toEqual({ local: 10 });
    expect(defaultSplit(["state"], 10)).toEqual({ local: 5, state: 5 });
    expect(defaultSplit(["country", "state"], 10)).toEqual({ local: 4, state: 3, country: 3 });
    expect(defaultSplit(["global", "country", "state"], 10)).toEqual({
      local: 4,
      state: 2,
      country: 2,
      global: 2,
    });
    expect(defaultSplit(["state", "country"], 20)).toEqual({ local: 8, state: 6, country: 6 });
  });

  it("keeps reach order with Local first", () => {
    expect(enabledInOrder(["global", "state"])).toEqual(["local", "state", "global"]);
  });

  it("bounds each stepper by its minimum and what the others leave", () => {
    const targets = { local: 4, state: 3, country: 3 };
    const on = ["local", "state", "country"] as const;
    expect(usedQuestions(targets, on)).toBe(10);
    expect(stepperBounds("local", targets, on, 10)).toEqual({ min: 4, max: 4 });
    expect(stepperBounds("state", targets, on, 10)).toEqual({ min: 1, max: 3 });
    expect(stepperBounds("global", targets, on, 10)).toEqual({ min: 0, max: 0 });
    expect(stepperBounds("local", { local: 6 }, ["local"], 10)).toEqual({ min: 4, max: 10 });
  });

  it("marks fewer than 5 questions as a small sample", () => {
    expect(isSmallSample(4)).toBe(true);
    expect(isSmallSample(5)).toBe(false);
    expect(isSmallSample(0)).toBe(false);
    expect(smallSampleNote(3)).toBe(
      "Small sample (3 questions): this figure can move a lot between audits.",
    );
  });
});
