// @vitest-environment jsdom
/**
 * 2 Nov -- the reports pages and Settings -> Report branding: the list links
 * to it ("Customise report branding"), and when this brand's reports print
 * no agency name -- the cover then shows only "Powered by Vunnara" -- both
 * the list and a report's own page say where to add one.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ brandId: "brand-1", reportId: "report-1" }),
  usePathname: () => "/brands/brand-1/reports",
}));

import ReportDetailPage from "@/app/(auth)/brands/[brandId]/reports/[reportId]/page";
import ReportsListPage from "@/app/(auth)/brands/[brandId]/reports/page";

const HINT = "Add your agency name and logo in Settings → Report branding";
const REPORT = {
  id: "report-1",
  headline: "AI mentions Omega Services",
  narrativeText: "",
  periodLabel: "2026-W44",
  reportType: "weekly",
  pdfUrl: "https://storage.example/report.pdf",
  emailSentAt: null,
  keyWins: [],
  keyGaps: [],
  fanOutSummary: null,
  topicalSummary: null,
  mentionSourceSummary: null,
  confidenceNotes: [],
  createdAt: "2026-11-02T08:13:00.000Z",
  status: "ready",
  pdfFailureReason: null,
};

function serve(agencyName: string | null, reportOk = true) {
  global.fetch = vi.fn(async (url: string) => {
    if (url.startsWith("/api/report-branding")) {
      return new Response(
        reportOk ? JSON.stringify({ agencyName, logoSet: false, canEdit: true }) : "{}",
        { status: reportOk ? 200 : 500 },
      );
    }
    return new Response(JSON.stringify(url.endsWith("/reports") ? [] : REPORT));
  }) as unknown as typeof fetch;
}

const realFetch = global.fetch;
afterEach(() => {
  cleanup();
  global.fetch = realFetch;
});

describe("the reports list", () => {
  it("no agency name: says where to add one, linked; and 'Customise report branding'", async () => {
    serve(null);
    render(<ReportsListPage />);
    expect(await screen.findByRole("link", { name: HINT })).toHaveAttribute(
      "href",
      "/settings/report-branding",
    );
    expect(screen.getByRole("link", { name: "Customise report branding" })).toHaveAttribute(
      "href",
      "/settings/report-branding",
    );
    expect(global.fetch).toHaveBeenCalledWith("/api/report-branding?brandId=brand-1");
  });

  it("with an agency name: no hint, the link stays", async () => {
    serve("Splice Marketing");
    render(<ReportsListPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("link", { name: "Customise report branding" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: HINT })).toBeNull();
  });

  it("if the answer can't be read: no hint -- never one that may be false", async () => {
    serve(null, false);
    render(<ReportsListPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("link", { name: HINT })).toBeNull();
  });
});

describe("a report's own page", () => {
  it("no agency name: says where to add one", async () => {
    serve(null);
    render(<ReportDetailPage />);
    expect(await screen.findByRole("link", { name: HINT })).toHaveAttribute(
      "href",
      "/settings/report-branding",
    );
  });

  it("with an agency name: no hint", async () => {
    serve("Splice Marketing");
    render(<ReportDetailPage />);
    await screen.findByRole("heading", { name: REPORT.headline });
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/report-branding?brandId=brand-1"),
    );
    expect(screen.queryByRole("link", { name: HINT })).toBeNull();
  });
});
