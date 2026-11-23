/**
 * S01 part 10 (contract P09.cover; LLD 8.1.7 D-RT3): the report type's name on the PDF cover -- on its own line directly
 * above the cover's title, in the eyebrow style, uppercase -- only on Agency and up (coverTierName, set from the
 * workspace's names when the report was made and kept in its snapshot, so a later rename never changes it). Growth and
 * every report before tiers show no name; the rest of the cover is unchanged.
 */
import { describe, expect, it } from "vitest";
import { ReportDocument } from "@/lib/communication/pdf-builder";
import type { ReportData } from "@/lib/reports/report-data";
import type { ReportDataV2 } from "@/lib/reports/report-snapshot";
import { pagesForTier } from "@/lib/reports/report-tiers";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { reportDataFixture } from "@/tests/helpers/report-data-fixture";

function withCover(data: ReportData, coverTierName: string | null): ReportDataV2 {
  return {
    ...data,
    v2: {
      tier: "standard",
      tierLabel: coverTierName ?? "Standard",
      coverTierName,
      sections: pagesForTier("standard"),
      whatToDoNext: null,
      beyondAi: null,
      agencyName: "Splice Marketing",
      questionMix: {
        everyday: data.questions.everyday,
        branded: data.questions.branded,
        bySource: { original: data.questions.everyday },
      },
    },
  };
}

const cover = (data: ReportData) => collectPdfPages(<ReportDocument data={data} />)[0];

describe("the cover's report name (P09.cover)", () => {
  it("Agency and up: the name in capitals, directly above the cover's title", () => {
    const page = cover(withCover(reportDataFixture("39"), "Growth Plan"));
    const at = page.indexOf("GROWTH PLAN");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(page[at + 1]).toBe("AI Visibility Report");
  });

  it("the name is the only addition; with none (Growth, or a report from before tiers) there's no line", () => {
    const named = cover(withCover(reportDataFixture("39"), "Growth Plan"));
    const plain = cover(withCover(reportDataFixture("39"), null));
    expect(named.filter((t) => t !== "GROWTH PLAN")).toEqual(plain);
    const today = cover(reportDataFixture("39"));
    expect(today.join(" ")).not.toMatch(/GROWTH PLAN|BASIC|STANDARD|ENHANCED/);
  });

  it("an agency's name is printed as text (an XSS payload stays text)", () => {
    const page = cover(withCover(reportDataFixture("39"), "<b>Gold</b>"));
    expect(page).toContain("<B>GOLD</B>");
  });
});
