import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASELINE_PATH,
  compareWithBaseline,
  E2E_BASELINE_PATH,
  failuresIn,
  playwrightFailuresIn,
  readBaseline,
} from "../../../scripts/qa/compare-failures";

/**
 * Follow-ups from d247ba7..f13411d, part 2 -- one committed baseline, compared by name. Reports had called
 * 18, 20 and 29 failures "all baseline" and named the baseline both "20" and "46 tests": every one of
 * those runs failed a subset of the same 46 tests, which lived only in files outside the repo.
 */
const root = resolve(__dirname, "../../..");
const baselineText = readFileSync(BASELINE_PATH, "utf8");
const baseline = readBaseline(baselineText);
const fileOf = (test: string) => test.split(" > ")[0];

describe("tests/known-failures.txt", () => {
  // The 9 Nov triage (regression follow-ups, part 5) fixed or updated all 46 tests listed from 37777de. From
  // 10 Nov to 11 Nov one entry, the legal-name placeholder (Playwright-run follow-ups, part 7), gone when Sri
  // set the name and ABN. One goes in only with its reason, on its own line.
  it("lists each accepted failure with its reason after '  # '", () => {
    const testLines = baselineText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("flaky:"));
    expect(testLines.filter((l) => !/\s#\s\S/.test(l))).toEqual([]);
    expect(baseline.tests.size).toBe(testLines.length);
  });

  it("names test files that exist, each test once", () => {
    const lines = baselineText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("flaky:"));
    expect(new Set(lines).size).toBe(lines.length);
    for (const file of new Set(lines.map(fileOf))) {
      expect(existsSync(resolve(root, file)), file).toBe(true);
    }
    expect(baseline.flakyFiles).toEqual([
      "tests/integration/rate-limit-fallback.integration.test.ts",
    ]);
    expect(existsSync(resolve(root, baseline.flakyFiles[0]))).toBe(true);
  });

  it("is where CLAUDE.md's testing rules point", () => {
    const claudeMd = readFileSync(resolve(root, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("tests/known-failures.txt");
    expect(claudeMd).toContain("scripts/qa/compare-failures.ts");
  });
});

describe("compare-failures", () => {
  const known =
    "tests/unit/api/brands-single.test.ts > DELETE /api/brands/[brandId] > returns 204 on success";
  // A baseline of its own, so these checks don't depend on what the committed one holds.
  const baseline = readBaseline(
    [
      "# a comment",
      `${known}    # accepted: a reason`,
      "flaky: tests/integration/rate-limit-fallback.integration.test.ts",
    ].join("\n"),
  );
  const output = [
    " ✓ |unit| tests/unit/other.test.ts (3 tests) 12ms",
    `\u001b[31m FAIL \u001b[39m |unit| ${known}`,
    ` FAIL  |unit| ${known}`,
    " FAIL  |integration| tests/integration/new-thing.integration.test.ts > route > refuses a viewer",
    " FAIL  |unit| tests/unit/broken-import.test.ts [ tests/unit/broken-import.test.ts ]",
    " FAIL  |integration| tests/integration/rate-limit-fallback.integration.test.ts > window > resets",
    "      Tests  4 failed | 10 passed (14)",
  ].join("\n");

  it("reads each failed test once, without its project label or colours", () => {
    expect(failuresIn(output)).toEqual([
      "tests/integration/new-thing.integration.test.ts > route > refuses a viewer",
      "tests/integration/rate-limit-fallback.integration.test.ts > window > resets",
      known,
      "tests/unit/broken-import.test.ts [ tests/unit/broken-import.test.ts ]",
    ]);
  });

  it("sorts them into known, new and the known flake, by name", () => {
    const result = compareWithBaseline(failuresIn(output), baseline);
    expect(result.known).toEqual([known]);
    expect(result.flaky).toEqual([
      "tests/integration/rate-limit-fallback.integration.test.ts > window > resets",
    ]);
    expect(result.new).toEqual([
      "tests/integration/new-thing.integration.test.ts > route > refuses a viewer",
      "tests/unit/broken-import.test.ts [ tests/unit/broken-import.test.ts ]",
    ]);
  });

  it("calls a renamed or reworded known test new: names, not counts", () => {
    const renamed = `${known} (renamed)`;
    expect(compareWithBaseline([renamed], baseline).new).toEqual([renamed]);
  });
});

/**
 * Playwright-run follow-ups (9 Nov), part 6 -- the Playwright baseline, compared the same way (--e2e). The 9 Nov
 * run's 133 failures were counted by hand from 18 list outputs; now each is a name, and a run's failures not in
 * tests/e2e/known-failures.txt are new.
 */
describe("tests/e2e/known-failures.txt (the Playwright baseline)", () => {
  const e2eText = readFileSync(E2E_BASELINE_PATH, "utf8");
  const e2eLines = e2eText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("flaky:"));

  it("lists each accepted failure with its reason after '  # ', naming a spec that exists", () => {
    expect(e2eLines.filter((l) => !/\s#\s\S/.test(l))).toEqual([]);
    for (const line of e2eLines) {
      const spec = line.split(" > ")[0];
      expect(existsSync(resolve(root, spec)), spec).toBe(true);
    }
  });

  it("reads Playwright's list output by name: spec path with '/', describe, test, no line number", () => {
    const output = [
      "  1) [chromium] › tests\\e2e\\sprint9\\s9-autopilot-e2e.spec.ts:603:7 › 5.8 — Canon-declared states (F25) › brand with NO audit",
      "",
      "    Error: expect(received).toContain(expected)",
      "  2) [chromium] › tests\\e2e\\01-auth.spec.ts:40:3 › Authentication › sign-up page renders",
      "  2 failed",
      "    [chromium] › tests\\e2e\\01-auth.spec.ts:40:3 › Authentication › sign-up page renders",
    ].join("\n");
    expect(playwrightFailuresIn(output)).toEqual([
      "tests/e2e/01-auth.spec.ts > Authentication > sign-up page renders",
      "tests/e2e/sprint9/s9-autopilot-e2e.spec.ts > 5.8 — Canon-declared states (F25) > brand with NO audit",
    ]);
  });

  it("a known Playwright failure is known, by its full name; anything else is new", () => {
    const known = readBaseline(e2eText);
    const failures = [...known.tests, "tests/e2e/01-auth.spec.ts > Authentication > something new"];
    const result = compareWithBaseline(failures, known);
    expect(result.known).toEqual([...known.tests]);
    expect(result.new).toEqual(["tests/e2e/01-auth.spec.ts > Authentication > something new"]);
  });
});
