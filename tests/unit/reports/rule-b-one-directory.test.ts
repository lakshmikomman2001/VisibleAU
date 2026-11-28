/**
 * S04B part 5 (LLD amendment 106): rule b's reason names its directories in the right number -- "This is the directory
 * it cited most in them." for one (live audit #57 printed "These are the directories ..." beside a single directory),
 * "These are the directories ..." for more, with "they" for two engines. The seeded reports' forms are in
 * tests/integration/rule-b-directories.integration.test.tsx and measured-wording.integration.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { citedMostReason } from "@/lib/reports/report-findings";

const CLAUDE = { engine: "claude", sampleCount: 10 };
const GEMINI = { engine: "gemini", sampleCount: 13 };

describe("rule b's reason, one directory or several", () => {
  it("one directory", () => {
    expect(citedMostReason([CLAUDE], 1)).toBe(
      "Claude didn't name you in any of its 10 answers to everyday questions. This is the directory it cited most in them.",
    );
    expect(citedMostReason([CLAUDE, GEMINI], 1)).toBe(
      "Claude and Gemini didn't name you in any of their 23 answers to everyday questions. This is the directory they cited most in them.",
    );
  });

  it("several directories", () => {
    expect(citedMostReason([CLAUDE], 3)).toBe(
      "Claude didn't name you in any of its 10 answers to everyday questions. These are the directories it cited most in them.",
    );
    expect(citedMostReason([CLAUDE, GEMINI], 2)).toBe(
      "Claude and Gemini didn't name you in any of their 23 answers to everyday questions. These are the directories they cited most in them.",
    );
  });
});
