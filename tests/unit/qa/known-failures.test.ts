import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASELINE_PATH,
  compareWithBaseline,
  failuresIn,
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
  // The 9 Nov triage (regression follow-ups, part 5) fixed or updated all 46 tests listed from 37777de: the
  // baseline is empty, so every failure is new. One goes in only with its reason, on its own line.
  it("lists each accepted failure with its reason after '  # ' (none since the 9 Nov triage)", () => {
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
  // A baseline of its own: the committed one is empty since the 9 Nov triage.
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
