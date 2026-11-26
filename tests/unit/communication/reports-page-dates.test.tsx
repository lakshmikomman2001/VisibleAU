// @vitest-environment jsdom
/**
 * S02 part 0B (LLD amendment 73; contract P17): the Reports list prints each report's date as "25 Nov 2026" (the app's
 * short date, lib/format/date.ts) and its period as "Week 47, 2026" -- a monthly report "November 2026" -- where it
 * printed "25/11/2026" and "2026-W47". The pink "Communication" pill beside the title (components/phase2/layer-badge,
 * the Phase 2 module the page belongs to) told the reader nothing about their reports: gone. The download link is named
 * with the same period.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ReportV2Provider } from "@/components/domain/reports/report-v2-context";
import { RoleProvider } from "@/components/domain/role-context";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ brandId: "brand-1" }),
  usePathname: () => "/brands/brand-1/reports",
}));

import ReportsListPage from "@/app/(auth)/brands/[brandId]/reports/page";

const OWNER = "owner" as const;

const row = (over: Record<string, unknown>) => ({
  id: "r1",
  headline: "Bluegum Home Services: AI visibility, week 47",
  periodLabel: "2026-W47",
  reportType: "weekly",
  pdfUrl: "https://files.test/r1.pdf",
  emailSentAt: null,
  // 9:30 am on 25 Nov in Sydney; 24 Nov in UTC, so the date must be Sydney's.
  createdAt: "2026-11-24T22:30:00.000Z",
  status: "ready",
  ...over,
});

function stubList(rows: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.startsWith("/api/report-branding")
        ? Response.json({ agencyName: "" })
        : Response.json(rows),
    ),
  );
}

const renderPage = (reportV2 = false) =>
  render(
    <ReportV2Provider on={reportV2}>
      <RoleProvider role={OWNER}>
        <ReportsListPage />
      </RoleProvider>
    </ReportV2Provider>,
  );

beforeAll(async () => {
  // The first render of the page in a jsdom worker can take several seconds; warm it up outside the tests' limit.
  stubList([]);
  renderPage();
  await screen.findByRole("heading", { name: "Reports" }, { timeout: 30_000 });
  cleanup();
}, 60_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the Reports list's dates and periods (P17)", () => {
  it('prints the date as "25 Nov 2026" in Sydney time and the week as "Week 47, 2026"', async () => {
    stubList([row({})]);
    renderPage();
    expect(await screen.findByText("Week 47, 2026", {}, { timeout: 15_000 })).toBeInTheDocument();
    expect(screen.getByText("25 Nov 2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-W47")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  }, 30_000);

  it("with report_v2 on, the download link is named with the same period (amendment 43's name)", async () => {
    stubList([row({ tierName: "Standard" })]);
    renderPage(true);
    expect(
      await screen.findByRole(
        "link",
        { name: "Download Standard PDF for Week 47, 2026" },
        { timeout: 15_000 },
      ),
    ).toBeInTheDocument();
  }, 30_000);

  it('a monthly report\'s period reads "November 2026"', async () => {
    stubList([row({ id: "r2", periodLabel: "2026-11", reportType: "monthly" })]);
    renderPage();
    expect(await screen.findByText("November 2026", {}, { timeout: 15_000 })).toBeInTheDocument();
    expect(screen.queryByText("2026-11")).not.toBeInTheDocument();
  }, 30_000);

  it('the title has no "Communication" pill beside it', async () => {
    stubList([row({})]);
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Reports" }, { timeout: 15_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Communication")).not.toBeInTheDocument();
  }, 30_000);
});
