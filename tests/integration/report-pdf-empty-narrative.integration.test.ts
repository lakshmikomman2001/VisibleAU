/**
 * DEMO-BLOCKER (1 Nov), part 3 -- if the grounding check drops every
 * sentence of the narrative, the PDF still renders, with the computed
 * sections only; and with zero directory citations it still renders.
 *
 * S03 part 0 (LLD amendment 77): moved from tests/unit/reports/report-pdf-empty-narrative.test.ts; the two reports are
 * invented businesses seeded as real audits and rendered by the real path (tests/helpers/seeded-report-data.ts: every
 * engine answering, and Claude failing every question), no longer hand-composed report data. The seeds are made with
 * the real narrative; only the PDFs these tests build have every sentence dropped.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { IRONSTONE } from "@/tests/helpers/report-seeds";
import { IRONSTONE_ALL_ENGINES, seededReportData } from "@/tests/helpers/seeded-report-data";

const narrative = vi.hoisted(() => ({ dropEverySentence: false }));

vi.mock("@/lib/reports/report-narrative", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/report-narrative")>();
  return {
    ...actual,
    reportNarrative: vi.fn((...args: Parameters<typeof actual.reportNarrative>) =>
      narrative.dropEverySentence
        ? { headline: "AI Visibility Report", paragraphs: [], dropped: 6 }
        : actual.reportNarrative(...args),
    ),
  };
});

const report = seededReportData({ allEngines: IRONSTONE_ALL_ENGINES, claudeFailed: IRONSTONE });

afterEach(() => {
  narrative.dropEverySentence = false;
});

describe("the report PDF renders without a narrative", () => {
  it("with every narrative sentence dropped", async () => {
    narrative.dropEverySentence = true;
    const { buildReportPdf } = await import("@/lib/communication/pdf-builder");
    const pdf = await buildReportPdf(report("allEngines"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  }, 60_000);

  it("with zero directory citations", async () => {
    narrative.dropEverySentence = true;
    const { buildReportPdf } = await import("@/lib/communication/pdf-builder");
    const data = report("claudeFailed");
    data.directories.rows = [];
    const pdf = await buildReportPdf(data);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);
});
