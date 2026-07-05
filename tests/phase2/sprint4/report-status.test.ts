import { describe, expect, it } from "vitest";
import { deriveReportStatus } from "@/lib/communication/types";
import type { ReportStatus } from "@/lib/communication/types";

describe("deriveReportStatus (CM-01: no status column)", () => {
  it("returns 'generating' when pdfUrl is null", () => {
    const status: ReportStatus = deriveReportStatus(null, null);
    expect(status).toBe("generating");
  });

  it("returns 'ready' when pdfUrl is set but emailSentAt is null", () => {
    const status = deriveReportStatus("https://cdn.example.com/report.pdf", null);
    expect(status).toBe("ready");
  });

  it("returns 'published' when both pdfUrl and emailSentAt are set", () => {
    const status = deriveReportStatus(
      "https://cdn.example.com/report.pdf",
      new Date("2026-06-15T10:00:00Z"),
    );
    expect(status).toBe("published");
  });

  it("returns 'generating' when pdfUrl is null even if emailSentAt is somehow set", () => {
    const status = deriveReportStatus(null, new Date("2026-06-15T10:00:00Z"));
    expect(status).toBe("generating");
  });

  it("never returns any value outside the ReportStatus union", () => {
    const validStatuses: ReportStatus[] = ["generating", "ready", "published"];
    const combinations: [string | null, Date | null][] = [
      [null, null],
      ["url", null],
      ["url", new Date()],
      [null, new Date()],
    ];
    for (const [pdf, email] of combinations) {
      expect(validStatuses).toContain(deriveReportStatus(pdf, email));
    }
  });
});
