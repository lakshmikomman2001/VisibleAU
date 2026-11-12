/**
 * 13 Nov (audit #46) -- one mention check, no second copy. The four engines (both audit runners) and
 * Google's AI Overviews and AI Mode decide "mentioned" with the same function, lib/audit/answer-mention.ts's
 * answerMention (find the name, then verify it only when found), so the engines' block and the Google block
 * can't disagree on what counts. Before this, the runners and the Google collector each called
 * detectBrandMention and verifyMention themselves (Audit reliability, Part B's parity test, which this
 * file replaces, checked the runners' two copies were alike).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CHECKERS = [
  "lib/audit/run-audit-inline.ts",
  "inngest/functions/run-audit.ts",
  "lib/audit/google-surfaces/collect.ts",
];

describe("the four engines and Google use the one mention check", () => {
  for (const file of CHECKERS) {
    const src = readFileSync(file, "utf8");

    it(`${file} imports answerMention from lib/audit/answer-mention`, () => {
      expect(src).toMatch(
        /import\s*\{\s*answerMention\s*\}\s*from\s*"@\/lib\/audit\/answer-mention"/,
      );
    });

    it(`${file} calls answerMention once and never finds or verifies a mention itself`, () => {
      expect(src.match(/answerMention\(\{/g) ?? []).toHaveLength(1);
      for (const own of [
        "detectBrandMention(",
        "verifyMention(",
        "brandNamePattern(",
        "spacingFreeNamePattern(",
      ]) {
        expect(src.includes(own), `${file} calls ${own} itself`).toBe(false);
      }
    });

    it(`${file} stores the check's verification on the row as mentionVerification`, () => {
      expect(src).toMatch(/verification:\s*mentionVerification\s*\}\s*=\s*await answerMention/);
      expect(src).toMatch(/\bmentionVerification\s*[,}]/);
    });
  }

  it("answerMention verifies only a name it found, with the whole brand (name, domain and location)", () => {
    const src = readFileSync("lib/audit/answer-mention.ts", "utf8");
    expect(src).toMatch(/mention\.found\s*\?\s*verifyMention\(\{/);
    const brandType = src.slice(
      src.indexOf("interface MentionBrand"),
      src.indexOf("}", src.indexOf("interface MentionBrand")),
    );
    for (const field of [
      "name",
      "domain",
      "suburb",
      "city",
      "state",
      "locationConfirmedAt",
      "locationMode",
    ]) {
      expect(brandType, `MentionBrand is missing ${field}`).toMatch(new RegExp(`\\b${field}:`));
    }
  });

  it("the runners still write mentionVerification into the citations insert", () => {
    for (const file of CHECKERS.slice(0, 2)) {
      const src = readFileSync(file, "utf8");
      const insertIdx = src.indexOf("insert(citations)");
      expect(insertIdx, file).toBeGreaterThan(-1);
      expect(src.slice(insertIdx, insertIdx + 800), file).toMatch(/\bmentionVerification\s*[,:]/);
    }
  });
});
