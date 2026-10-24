/**
 * Price corrections (25 Oct), item 5 -- the CI exports gate Visibility on the
 * app's own headline bands (lib/scoring/headline-color.ts), imported, never
 * copied: a business the app calls "strong" never fails its build.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { visibilityCheck } from "@/lib/exports/ci-checks";
import { HEADLINE_COLOR_THRESHOLDS } from "@/lib/scoring/headline-color";

const repoRoot = path.resolve(__dirname, "../../..");

/** Code only -- doc comments may quote the bands in prose. */
function code(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

describe("CI exports use the app's headline bands", () => {
  it("ci-checks.ts imports the bands and defines no percentage thresholds of its own", () => {
    const src = code("lib/exports/ci-checks.ts");
    expect(src).toMatch(/from "@\/lib\/scoring\/headline-color"/);
    // No numeric comparison and no numeric constant -- the only numbers it
    // may print come from the imported thresholds.
    expect(src).not.toMatch(/[<>]=?\s*\d/);
    expect(src).not.toMatch(/\b(const|let)\s+\w+\s*=\s*\d/);
  });

  it("the builders don't compare against numbers either", () => {
    for (const rel of ["lib/exports/gha.ts", "lib/exports/junit.ts", "lib/exports/sarif.ts"]) {
      expect(code(rel), rel).not.toMatch(/[<>]=?\s*\d/);
    }
  });

  it("the gate follows the band boundaries exactly", () => {
    const at = (value: number) =>
      visibilityCheck({
        headline: { status: "scored", value, ci: { lower: 0, upper: 100 } },
        sampleCount: 100,
        mentionDetail: {
          mentionedCount: value,
          rankedCount: 0,
          medianPosition: null,
          sourcedCount: 0,
        },
      }).kind;
    const { developing, strong } = HEADLINE_COLOR_THRESHOLDS;
    expect(at(developing - 1)).toBe("error");
    expect(at(developing)).toBe("warning");
    expect(at(strong - 1)).toBe("warning");
    expect(at(strong)).toBe("notice");
  });
});
