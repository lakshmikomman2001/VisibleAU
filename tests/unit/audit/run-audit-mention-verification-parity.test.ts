/**
 * Audit reliability, Part B, item 3 -- "One resolver path; no second
 * copy." Same cross-runner parity concern as the sibling
 * run-audit-citedurls-parity.test.ts (task #43) and
 * run-audit-failure-parity.test.ts (Part A): both audit runners must
 * call the ONE shared lib/audit/verify-mention.ts resolver and write
 * an identical mentionVerification value onto the citations row, not
 * two independently-drifting reimplementations of the domain/location
 * check.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RUNNER_FILES = ["lib/audit/run-audit-inline.ts", "inngest/functions/run-audit.ts"];

describe("both audit runners use the one shared mention-verification resolver", () => {
  for (const file of RUNNER_FILES) {
    it(`${file} imports verifyMention from lib/audit/verify-mention`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/import\s*\{\s*verifyMention\s*\}\s*from\s*"@\/lib\/audit\/verify-mention"/);
    });

    it(`${file} calls verifyMention exactly once, only when a name match was found`, () => {
      const src = readFileSync(file, "utf8");
      const calls = src.match(/verifyMention\(\{/g) ?? [];
      expect(calls.length).toBe(1);
      // mention.found ? verifyMention({...}) : null -- never unconditional,
      // never defaulted to "unverified"/"verified_*" without running the
      // real resolver.
      expect(src).toMatch(/mention\.found\s*\n?\s*\?\s*verifyMention\(\{/);
    });

    it(`${file} passes the brand's domain, suburb, city, state, locationConfirmedAt and locationMode -- never a partial brand object`, () => {
      const src = readFileSync(file, "utf8");
      const idx = src.indexOf("verifyMention({");
      expect(idx).toBeGreaterThan(-1);
      const block = src.slice(idx, idx + 500);
      for (const field of ["domain", "suburb", "city", "state", "locationConfirmedAt", "locationMode"]) {
        expect(block, `${file}'s verifyMention call is missing brand.${field}`).toMatch(
          new RegExp(`\\b${field}\\s*:`),
        );
      }
    });

    it(`${file} stores the resolver's result on the citations row as mentionVerification`, () => {
      const src = readFileSync(file, "utf8");
      const insertIdx = src.indexOf("insert(citations)");
      expect(insertIdx).toBeGreaterThan(-1);
      const valuesBlock = src.slice(insertIdx, insertIdx + 800);
      expect(valuesBlock).toMatch(/\bmentionVerification\s*[,:]/);
    });
  }
});
