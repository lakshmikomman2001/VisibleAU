/**
 * S02 part 3 (LLD 8.2.1): both audit runners take their questions from one function, getAuditQuestions
 * (lib/audit/get-audit-prompts.ts: the brand's current question set, or today's logic when it has none), and neither
 * sets the number of questions: PROMPTS_PER_AUDIT is only the size of a pack built from templates, inside that
 * function (the inline runner passes on the free sample's own count). They once each had their own copy of the
 * logic, and the Inngest one re-sliced a stored pack to a hard-coded 10.
 */
import { describe, expect, it } from "vitest";
import { sourceText } from "@/tests/helpers/source-files";

const RUNNERS = ["lib/audit/run-audit-inline.ts", "inngest/functions/run-audit.ts"] as const;

/** The code without its comments, so a comment naming the old function doesn't count. */
const code = (path: string) =>
  sourceText(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("one question source for both audit runners", () => {
  it.each(RUNNERS)("%s calls getAuditQuestions once and sets no question count", (path) => {
    const text = code(path);
    expect(text.match(/\bgetAuditQuestions\(/g)).toHaveLength(1);
    expect(text).not.toMatch(/\bgetAuditPrompts\(/);
    expect(text).not.toMatch(/\bPROMPTS_PER_AUDIT\b/);
  });

  it.each(
    RUNNERS,
  )("%s records the set on the audit and each question on its answers and failures", (path) => {
    const text = code(path);
    expect(text).toMatch(/questionSetId[,:]/);
    expect(text.match(/questionId: prompts\[[^\]]+\]\.questionId \?\? null/g)).toHaveLength(2);
  });

  it("the template count is getAuditQuestions' default, PROMPTS_PER_AUDIT", () => {
    expect(code("lib/audit/get-audit-prompts.ts")).toMatch(
      /opts\.promptCount \?\? PROMPTS_PER_AUDIT/,
    );
  });
});
