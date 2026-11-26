// @vitest-environment jsdom
/**
 * S01 part 9 (contract P17 statuses; LLD 8.1.7): "Running checks..." -- an Enhanced report is written before its checks
 * are refreshed, and until its contents are stored the Reports page says so, keeps polling, then moves to
 * "Generating..." and "Ready" as today. The list never carries the contents snapshot (the PDF's render input).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoleProvider } from "@/components/domain/role-context";
import { reportForPage } from "@/lib/communication/report-view";
import { shouldPollReports } from "@/lib/communication/should-poll-reports";
import { deriveReportStatus } from "@/lib/communication/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ brandId: "brand-1" }),
  usePathname: () => "/brands/brand-1/reports",
}));

import ReportsListPage from "@/app/(auth)/brands/[brandId]/reports/page";

const OWNER = "owner" as const;
const NOW = Date.now();
const row = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  pdfUrl: null,
  emailSentAt: null,
  pdfFailureReason: null,
  updatedAt: new Date(NOW - 30_000),
  reportTier: "enhanced",
  hasSnapshot: false,
  ...over,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the status of an Enhanced report while its checks run", () => {
  it("running_checks until the contents are stored, then generating, as today", () => {
    expect(deriveReportStatus(null, null, { updatedAt: new Date(NOW), runningChecks: true })).toBe(
      "running_checks",
    );
    expect(deriveReportStatus(null, null, { updatedAt: new Date(NOW) })).toBe("generating");
    // A stalled one is failed, whichever step it stalled in.
    expect(
      deriveReportStatus(null, null, { updatedAt: new Date(NOW - 3_600_000), runningChecks: true }),
    ).toBe("failed");
  });

  it("the list's row: running_checks for Enhanced with no contents yet, and never the snapshot itself", async () => {
    expect((await reportForPage(row(), null)).status).toBe("running_checks");
    expect((await reportForPage(row({ hasSnapshot: true }), null)).status).toBe("generating");
    expect((await reportForPage(row({ reportTier: "standard" }), null)).status).toBe("generating");
    const shown = await reportForPage(
      { ...row(), hasSnapshot: undefined, contentsSnapshot: { reportData: { secret: 1 } } },
      null,
    );
    expect(shown.status).toBe("generating");
    expect(shown).not.toHaveProperty("contentsSnapshot");
    expect(shown).not.toHaveProperty("hasSnapshot");
    // A row read without the snapshot column (a report from before S01) is never "running checks".
    const { hasSnapshot: _h, ...old } = row({ reportTier: "basic" });
    expect((await reportForPage(old, null)).status).toBe("generating");
  });

  it("the page keeps polling while checks run", () => {
    expect(shouldPollReports([{ pdfUrl: null, status: "running_checks" }], false)).toBe(true);
    expect(shouldPollReports([{ pdfUrl: "x", status: "ready" }], false)).toBe(false);
  });

  it("the Reports page shows Running checks… on the row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/report-branding")
          ? Response.json({ agencyName: "" })
          : Response.json([
              {
                id: "r1",
                headline: "NumbaTek IT: AI visibility, week 47",
                periodLabel: "2026-W47",
                reportType: "weekly",
                pdfUrl: null,
                emailSentAt: null,
                createdAt: new Date(NOW).toISOString(),
                status: "running_checks",
              },
            ]),
      ),
    );
    render(
      <RoleProvider role={OWNER}>
        <ReportsListPage />
      </RoleProvider>,
    );
    expect(await screen.findByText("Running checks…", {}, { timeout: 30_000 })).toBeInTheDocument();
  }, 60_000);
});
