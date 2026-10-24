/**
 * "Before pushing e53edf2" (24 Oct), item 4 -- the running page's 7
 * step labels are plain English. Each avoided word is matched at the
 * start of a word, so plurals and -ing forms ("citations", "rows",
 * "persisting", "extracting") are caught, but ordinary words that merely
 * contain one ("grow", "throw", "arrow") are not.
 */
import { describe, expect, it } from "vitest";
import { deriveSteps } from "@/components/domain/audit/audit-running";

const AVOID_WORDS = ["citation", "row", "persist", "pack", "extract", "SoV"];

function internalWordsIn(label: string): string[] {
  return AVOID_WORDS.filter((word) => new RegExp(`\\b${word}`, "i").test(label));
}

describe("Running-audit step labels are plain English (24 Oct, item 4)", () => {
  it("the final 7 labels for a 13 questions x 4 engines audit at 20/52 answers", () => {
    const labels = deriveSteps(38, 4, 13, 1, 20, 52).map((s) => s.label);

    expect(labels).toEqual([
      "Loading your brand details",
      "Preparing your 13 questions (10 everyday, 3 about your business)",
      "Querying 13 questions × 4 engines (20/52 answers)",
      "Detecting brand mentions",
      "Finding your cited sources",
      "Calculating your visibility",
      "Saving your results",
    ]);
  });

  it("no label, in any state the page can be in, contains an internal word", () => {
    const states = [
      // Counts not recorded yet (the first poll or two of a new audit).
      deriveSteps(0, null, null, null, 0, null),
      deriveSteps(38, 4, 13, 1, 20, 52),
      // No questions about the business itself.
      deriveSteps(50, 4, 10, 1, 20, 40),
      // A legacy audit still running at more than one run per question.
      deriveSteps(50, 4, 13, 3, 78, 156),
      deriveSteps(100, 4, 13, 1, 52, 52),
    ];

    const offenders = states.flatMap((steps) =>
      steps.flatMap(({ label }) => internalWordsIn(label).map((word) => `"${word}" in "${label}"`)),
    );

    expect(states.every((steps) => steps.length === 7)).toBe(true);
    expect(offenders).toEqual([]);
  });

  it("the word check itself catches the old labels and ignores look-alikes", () => {
    expect(internalWordsIn("Persisting citations + audit row")).toEqual([
      "citation",
      "row",
      "persist",
    ]);
    expect(internalWordsIn("Extracting cited sources")).toEqual(["extract"]);
    expect(internalWordsIn("Loading prompt pack")).toEqual(["pack"]);
    expect(internalWordsIn("Computing SoV")).toEqual(["SoV"]);
    expect(internalWordsIn("Watch your visibility grow, then throw it a party")).toEqual([]);
  });
});
