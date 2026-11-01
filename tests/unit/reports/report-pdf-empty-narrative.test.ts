/**
 * DEMO-BLOCKER (1 Nov), part 3 -- if the grounding check drops every
 * sentence of the narrative, the PDF still renders, with the computed
 * sections only; and with zero directory citations it still renders.
 */
import { describe, expect, it, vi } from "vitest";
import { reportDataFixture } from "@/tests/helpers/report-data-fixture";

vi.mock("@/lib/reports/report-narrative", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reports/report-narrative")>()),
  reportNarrative: vi.fn(() => ({ headline: "AI Visibility Report", paragraphs: [], dropped: 6 })),
}));

describe("the report PDF renders without a narrative", () => {
  it("with every narrative sentence dropped", async () => {
    const { buildReportPdf } = await import("@/lib/communication/pdf-builder");
    const pdf = await buildReportPdf(reportDataFixture("39"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  }, 60_000);

  it("with zero directory citations", async () => {
    const { buildReportPdf } = await import("@/lib/communication/pdf-builder");
    const data = reportDataFixture("37");
    data.directories.rows = [];
    const pdf = await buildReportPdf(data);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);
});
