/**
 * ⚠️ NNN — Answer Capsules page: the UI copy must read the same
 * ANSWER_CAPSULE_WORDS the detector enforces (no second hardcoded "20-25"),
 * and the zero-questions empty state must show the honest, already-computed
 * capsuleFinding instead of a misleading "re-run the audit" message that
 * implies the data is stale when it's actually a confirmed zero.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("⚠️ NNN — Answer Capsules page: single-sourced range, no stray literals", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/answer-capsules/page.tsx", "utf8");

  it("imports ANSWER_CAPSULE_WORDS from the detector and derives a label from it", () => {
    expect(src).toMatch(
      /import\s*\{\s*ANSWER_CAPSULE_WORDS\s*\}\s*from\s*"@\/lib\/answer-capsules\/find-questions"/,
    );
    expect(src).toMatch(/CAPSULE_RANGE_LABEL\s*=\s*`\$\{ANSWER_CAPSULE_WORDS\.min\}-\$\{ANSWER_CAPSULE_WORDS\.max\}`/);
  });

  it("no hardcoded '20-25' literal remains in the copy -- all three sites use the derived label", () => {
    expect(src).not.toMatch(/20-25 word/);
    expect((src.match(/\{CAPSULE_RANGE_LABEL\}/g) ?? []).length).toBe(3);
  });
});

describe("⚠️ NNN — Answer Capsules page: honest empty state, capsuleFinding surfaced", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/answer-capsules/page.tsx", "utf8");

  it("declares capsuleFinding on ContentFindings", () => {
    expect(src).toMatch(/capsuleFinding:\s*string\s*\|\s*null/);
  });

  it("distinguishes a genuinely-computed zero (show capsuleFinding) from stale/missing data (ask for a re-run)", () => {
    expect(src).toMatch(/hasQuestionsField\s*=\s*content\?\.questions\s*!==\s*undefined/);
    expect(src).toMatch(/hasQuestionsField[\s\S]{0,120}content\?\.capsuleFinding/);
  });

  it("the 're-run the audit' message is reachable only on the stale-data branch, not unconditionally for every zero-question case", () => {
    const reRunIndex = src.indexOf("Re-run the technical audit to see per-question capsule data.");
    expect(reRunIndex).toBeGreaterThan(-1);
    const ternaryStart = src.lastIndexOf("hasQuestionsField", reRunIndex);
    expect(ternaryStart).toBeGreaterThan(-1);
    // the re-run string must sit inside the same ternary that checks
    // hasQuestionsField, i.e. it's the ": else" branch, not unconditional.
    expect(src.slice(ternaryStart, reRunIndex)).toMatch(/capsuleFinding/);
  });
});
