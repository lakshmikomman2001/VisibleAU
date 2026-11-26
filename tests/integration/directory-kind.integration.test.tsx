/**
 * S00 part 5 (22 Nov; LLD 8.8.3, T6): a directory the audit's answers cited that isn't one of the brand's own
 * type's says what it is, on the audit page ("Local Business Guide cited in 3 of 7 answers · general directory")
 * and in the PDF's "Where AI looks" ("Local Business Guide · general directory"). The brand's own type's
 * directories read exactly as before in both, so Hero's report changes only by the rows a new citation adds.
 *
 * S03 part 0 (LLD amendment 77): moved from tests/unit/components/directory-kind.test.tsx; the PDF's report is an
 * invented business seeded as real audits and rendered by the real path (tests/helpers/seeded-report-data.ts), no
 * longer hand-composed report data.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DirectoriesCitedPanel,
  type DirectoryCitedPanelRow,
} from "@/components/domain/audit/directories-cited-panel";
import { ReportDocument } from "@/lib/reports/pdf/report-document";
import type { ReportData } from "@/lib/reports/report-data";
import { collectPdfText } from "@/tests/helpers/pdf-text";
import { IRONSTONE_ALL_ENGINES, seededReportData } from "@/tests/helpers/seeded-report-data";

const report = seededReportData({ allEngines: IRONSTONE_ALL_ENGINES });

function row(overrides: Partial<DirectoryCitedPanelRow>): DirectoryCitedPanelRow {
  return {
    key: "hipages",
    name: "hipages",
    citedCount: 1,
    citedUrls: [],
    ownerProfileLinked: false,
    ownerProfileCitedCount: 0,
    ...overrides,
  };
}

describe("the audit page's directories panel", () => {
  it("a cited directory that isn't the brand's own type's shows its kind", () => {
    const html = renderToStaticMarkup(
      DirectoriesCitedPanel({
        rows: [
          row({
            key: "local_business_guide",
            name: "Local Business Guide",
            citedCount: 3,
            kind: "general",
            relevantToBrand: false,
          }),
          row({
            key: "linkedin",
            name: "LinkedIn",
            citedCount: 2,
            kind: "professional",
            relevantToBrand: false,
          }),
        ],
        totalAnswers: 7,
      }),
    );
    expect(html).toContain('data-directory-kind="general"');
    expect(html).toContain(">general directory<");
    expect(html).toContain(">professional network<");
  });

  it("the brand's own type's directories read as before: no kind", () => {
    const html = renderToStaticMarkup(
      DirectoriesCitedPanel({
        rows: [
          row({ citedCount: 3, kind: "trades", relevantToBrand: true }),
          row({ key: "x", name: "Localsearch", citedCount: 2 }),
        ],
        totalAnswers: 37,
      }),
    );
    expect(html).not.toContain("data-directory-kind");
    expect(html).not.toContain("trades marketplace");
  });
});

/** The directories page's text, from the report a seed renders. */
function pdfText(data: ReportData): string {
  return collectPdfText(<ReportDocument data={data} />).join(" ");
}

describe("the PDF's Where AI looks", () => {
  it("a cited-only directory's row names its kind; the existing rows are word for word what they were", () => {
    const base = report("allEngines");
    const before = pdfText(base);
    const withNew: ReportData = {
      ...base,
      directories: {
        ...base.directories,
        rows: [
          ...base.directories.rows.map((r) => ({
            ...r,
            kind: "trades" as const,
            relevantToBrand: true,
          })),
          {
            key: "local_business_guide",
            name: "Local Business Guide",
            citedCount: 2,
            ownerProfileLinked: false,
            ownerProfileCitedCount: 0,
            ownerStatus: null,
            kind: "general",
            relevantToBrand: false,
          },
        ],
      },
    };
    const after = pdfText(withNew);
    // S01C part 3e, LLD amendment 64: "Directory names don't wrap: a type suffix ... goes on its own muted line" -- so
    // the name and its kind are two texts now, never "Local Business Guide · general directory" on one line.
    expect(after).toContain("Local Business Guide general directory");
    expect(after).not.toContain("Local Business Guide · general directory");
    // S03 part 0: the seeded rows also hold the usual directories for the brand's type that no answer cited
    // (citedCount 0), which the page doesn't list; every cited one is still there.
    const cited = base.directories.rows.filter((r) => r.citedCount > 0);
    expect(cited.map((r) => r.name)).toEqual(["hipages", "Localsearch", "Word of Mouth"]);
    for (const r of cited) expect(after).toContain(r.name);
    expect(after).not.toContain("hipages trades marketplace");
    expect(after).not.toContain("hipages · trades marketplace");
    // The rows the report had are unchanged when the new fields say they're the brand's own type's.
    const sameRows: ReportData = {
      ...base,
      directories: {
        ...base.directories,
        rows: base.directories.rows.map((r) => ({
          ...r,
          kind: "trades" as const,
          relevantToBrand: true,
        })),
      },
    };
    expect(pdfText(sameRows)).toBe(before);
  });
});
