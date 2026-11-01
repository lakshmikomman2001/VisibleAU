/**
 * URGENT PDF reports (1 Nov), part 2 -- the category a failed PDF records,
 * and the status a report shows.
 */
import { describe, expect, it } from "vitest";
import { pdfFailureReasonFor } from "@/lib/communication/report-pdf-failure";
import { deriveReportStatus, pdfFailureLabel } from "@/lib/communication/types";

describe("pdfFailureReasonFor: from the final error's message", () => {
  it.each([
    ["Storage is misconfigured: storage URL missing (SUPABASE_URL)", "storage_misconfigured"],
    [
      "Supabase Storage upload failed: fetch failed (cause: ENOTFOUND, Error: getaddrinfo ENOTFOUND x.supabase.co) [body: 10 bytes, Buffer]",
      "storage_unavailable",
    ],
    [
      "Supabase Storage upload failed: HTTP 400 Bucket not found [body: 10 bytes, Buffer]",
      "storage_rejected",
    ],
    ["Cannot read properties of undefined (reading 'map')", "render_error"],
  ])("%s -> %s", (message, reason) => {
    expect(pdfFailureReasonFor(message)).toBe(reason);
  });
});

describe("deriveReportStatus", () => {
  const now = Date.parse("2026-11-01T07:00:00Z");
  const minutesAgo = (m: number) => new Date(now - m * 60_000);

  it("a PDF: ready, or published once emailed", () => {
    expect(deriveReportStatus("org/r.pdf", null)).toBe("ready");
    expect(deriveReportStatus("org/r.pdf", new Date())).toBe("published");
  });

  it("no PDF and a recorded reason: failed", () => {
    expect(
      deriveReportStatus(null, null, {
        failureReason: "storage_unavailable",
        updatedAt: minutesAgo(1),
        now,
      }),
    ).toBe("failed");
  });

  it("no PDF, no reason: generating for 30 minutes, then failed (a report stuck before migration 0110)", () => {
    expect(deriveReportStatus(null, null, { updatedAt: minutesAgo(29), now })).toBe("generating");
    expect(deriveReportStatus(null, null, { updatedAt: minutesAgo(30), now })).toBe("failed");
    // The 1 Nov 16:51 report, seen at 18:00.
    expect(deriveReportStatus(null, null, { updatedAt: minutesAgo(69), now })).toBe("failed");
  });

  it("the old two-argument call (no updatedAt) is unchanged: generating", () => {
    expect(deriveReportStatus(null, null)).toBe("generating");
  });

  it("the reason's plain label; a stalled one says it didn't finish", () => {
    expect(pdfFailureLabel("storage_unavailable")).toBe("file storage couldn't be reached");
    expect(pdfFailureLabel(null)).toBe("it didn't finish");
    expect(pdfFailureLabel("not-a-reason")).toBe("it didn't finish");
  });
});
