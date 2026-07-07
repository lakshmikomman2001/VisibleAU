import { describe, expect, it } from "vitest";
import { deriveReportStatus } from "@/lib/communication/types";
import type { ReportStatus } from "@/lib/communication/types";

describe("deriveReportStatus (CM-01: status is UI-derived, no status column)", () => {
  it("pdf_url null → 'generating'", () => {
    expect(deriveReportStatus(null, null)).toBe("generating");
  });

  it("pdf_url null ignores emailSentAt (still generating)", () => {
    expect(deriveReportStatus(null, new Date())).toBe("generating");
  });

  it("pdf_url set + emailSentAt null → 'ready'", () => {
    expect(deriveReportStatus("https://storage.example.com/report.pdf", null)).toBe("ready");
  });

  it("pdf_url set + emailSentAt set → 'published'", () => {
    expect(
      deriveReportStatus("https://storage.example.com/report.pdf", new Date("2026-07-01T10:00:00Z")),
    ).toBe("published");
  });

  it("empty string pdf_url is falsy → 'generating'", () => {
    expect(deriveReportStatus("", null)).toBe("generating");
  });

  it("never returns a fourth value (type guard)", () => {
    const validStatuses: ReportStatus[] = ["generating", "ready", "published"];
    const testCases: [string | null, Date | null][] = [
      [null, null],
      [null, new Date()],
      ["https://x.com/a.pdf", null],
      ["https://x.com/a.pdf", new Date()],
    ];
    for (const [pdfUrl, emailSentAt] of testCases) {
      expect(validStatuses).toContain(deriveReportStatus(pdfUrl, emailSentAt));
    }
  });

  it("status transitions are progressive: generating → ready → published", () => {
    const s1 = deriveReportStatus(null, null);
    const s2 = deriveReportStatus("https://x.com/report.pdf", null);
    const s3 = deriveReportStatus("https://x.com/report.pdf", new Date());

    expect(s1).toBe("generating");
    expect(s2).toBe("ready");
    expect(s3).toBe("published");
  });

  it("any non-empty pdf_url string counts as 'set'", () => {
    expect(deriveReportStatus("/local/path.pdf", null)).toBe("ready");
    expect(deriveReportStatus("s3://bucket/key", null)).toBe("ready");
  });
});
