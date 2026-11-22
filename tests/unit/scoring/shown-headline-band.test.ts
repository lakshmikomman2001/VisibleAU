/**
 * S01 part 0 (D-BAND, LLD section 0.1): the score band colour follows the figure shown. Every surface prints a rate
 * with no decimals, so a rate of 9.6 reads "10%" and must be Developing, not Low; 29.5 reads "30%", Strong. One
 * shared helper (shownHeadlineBand, lib/scoring/headline-color.ts) is used by the audit page, the PDF, the badge SVG,
 * the visibility display (brand pages, Health Check) and the public sample result. Stored scores and figures are
 * unchanged (N3), and the CI export's build gate (lib/exports/ci-checks.ts) still judges the rate itself.
 */
import { describe, expect, it } from "vitest";
import { visibilityCheck } from "@/lib/exports/ci-checks";
import type { ReportData } from "@/lib/reports/report-data";
import { headlineFigures } from "@/lib/reports/report-format";
import type { DimensionResult } from "@/lib/scoring/dimension-result";
import { headlineColorBand, shownHeadlineBand } from "@/lib/scoring/headline-color";
import { visibilityDisplay } from "@/lib/scoring/visibility-display";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

const scored = (value: number): DimensionResult => ({
  status: "scored",
  value,
  ci: { lower: Math.max(0, value - 5), upper: value + 5 },
});

const EDGES: Array<[rate: number, shown: string, band: "low" | "developing" | "strong"]> = [
  [9.4, "9%", "low"],
  [9.5, "10%", "developing"],
  [9.6, "10%", "developing"],
  [29.4, "29%", "developing"],
  [29.5, "30%", "strong"],
  [29.6, "30%", "strong"],
];

describe("the band follows the figure shown (D-BAND)", () => {
  it.each(EDGES)("%s shows %s and is %s", (rate, _shown, band) => {
    expect(shownHeadlineBand(rate)).toBe(band);
  });

  it.each(EDGES)("the visibility display: %s -> %s, %s", (rate, shown, band) => {
    expect(
      visibilityDisplay({ headline: scored(rate), mentionedCount: 4, sampleCount: 40 }),
    ).toMatchObject({ value: shown, band });
  });

  it.each(EDGES)("the PDF's headline figures: %s -> %s, %s", (rate, shown, band) => {
    const data = {
      headline: scored(rate),
      mentionedCount: 4,
      sampleCount: 40,
    } as unknown as ReportData;
    expect(headlineFigures(data)).toMatchObject({ percent: shown, value: rate, band });
  });

  it("the stored rate is never changed, and the raw band is still the rate's own", () => {
    expect(
      visibilityDisplay({ headline: scored(9.6), mentionedCount: 4, sampleCount: 40 }),
    ).toMatchObject({ value: "10%" });
    expect(headlineColorBand(9.6)).toBe("low");
  });

  it("the CI export's build gate still judges the rate itself (a gate, not a colour)", () => {
    const check = visibilityCheck({
      headline: scored(9.6),
      sampleCount: 40,
      mentionDetail: { mentionedCount: 4 },
    } as Parameters<typeof visibilityCheck>[0]);
    expect(check.kind).toBe("error");
  });
});

/**
 * Every surface that colours a Visibility rate goes through the shared helper: no file other than the helper itself
 * and the CI gate calls headlineColorBand.
 */
const ROOTS = ["app", "components", "lib"];
readSourcesBeforeAll(ROOTS, /\.tsx?$/);

describe("one shared helper for the band of a shown figure", () => {
  it("only lib/scoring/headline-color.ts and the CI gate call headlineColorBand", () => {
    const callers = sourcePaths(ROOTS, /\.tsx?$/)
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => /\bheadlineColorBand\(/.test(sourceText(path)))
      .sort();
    expect(callers).toEqual(["lib/exports/ci-checks.ts", "lib/scoring/headline-color.ts"]);
  });

  it("the audit page, the PDF, the badge, the visibility display and the sample result use it", () => {
    for (const path of [
      "app/(auth)/audits/[auditId]/page.tsx",
      "lib/reports/pdf/report-document.tsx",
      "lib/reports/report-format.ts",
      "app/api/badge/route.ts",
      "lib/scoring/visibility-display.ts",
      "app/(marketing)/sample-audit/result/[id]/sample-result-view.tsx",
    ]) {
      expect(sourceText(path), path).toMatch(/\bshownHeadlineBand\(/);
    }
  });
});
