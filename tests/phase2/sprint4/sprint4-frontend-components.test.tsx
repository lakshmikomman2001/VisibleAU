// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/brands/test/reports",
  useParams: () => ({ brandId: "brand_test_1" }),
}));

// ═══════════════════════════════════════════════════════════════
// 3A — ReportStatusBadge (CM-01: derived status at the component)
// ═══════════════════════════════════════════════════════════════

describe("ReportStatusBadge (derived status — CM-01)", () => {
  async function renderBadge(status: "generating" | "ready" | "published") {
    const { ReportStatusBadge } = await import(
      "@/components/domain/communication/report-status-badge"
    );
    return render(React.createElement(ReportStatusBadge, { status }));
  }

  it('renders "Generating…" for generating status', async () => {
    await renderBadge("generating");
    expect(screen.getByText("Generating…")).toBeInTheDocument();
  });

  it('renders "Ready" for ready status', async () => {
    await renderBadge("ready");
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it('renders "Published" for published status', async () => {
    await renderBadge("published");
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("badge uses distinct background color per status", async () => {
    const { container: c1 } = await renderBadge("generating");
    const { container: c2 } = await renderBadge("ready");
    const span1 = c1.querySelector("span")!;
    const span2 = c2.querySelector("span")!;
    expect(span1.style.backgroundColor).not.toBe(span2.style.backgroundColor);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3B — shouldPollReports (REGRESSION: bug 9 — awaitingReport race)
// ═══════════════════════════════════════════════════════════════

describe("shouldPollReports (regression: bug 9 — awaitingReport bridges the 202-before-row race)", () => {
  async function getShouldPoll() {
    const m = await import("@/lib/communication/should-poll-reports");
    return m.shouldPollReports;
  }

  it("polls when a row has null pdfUrl (generating)", async () => {
    const shouldPollReports = await getShouldPoll();
    expect(shouldPollReports([{ pdfUrl: null }], false)).toBe(true);
  });

  it("polls when awaitingReport=true even if all existing rows are ready (the RACE: POST 202 before Inngest row)", async () => {
    const shouldPollReports = await getShouldPoll();
    expect(shouldPollReports([{ pdfUrl: "x.pdf" }], true)).toBe(true);
  });

  it("STOPS when all rows ready and not awaiting (no endless polling)", async () => {
    const shouldPollReports = await getShouldPoll();
    expect(shouldPollReports([{ pdfUrl: "x.pdf" }, { pdfUrl: "y.pdf" }], false)).toBe(false);
  });

  it("stops on empty list when not awaiting", async () => {
    const shouldPollReports = await getShouldPoll();
    expect(shouldPollReports([], false)).toBe(false);
  });

  it("polls on empty list when awaitingReport (just triggered, no row yet)", async () => {
    const shouldPollReports = await getShouldPoll();
    expect(shouldPollReports([], true)).toBe(true);
  });

  it("polls when mix of ready + generating rows (at least one null pdfUrl)", async () => {
    const shouldPollReports = await getShouldPoll();
    expect(shouldPollReports([{ pdfUrl: "a.pdf" }, { pdfUrl: null }], false)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3C — ReportCard (download gating on pdfUrl)
// ═══════════════════════════════════════════════════════════════

describe("ReportCard", () => {
  const BASE_REPORT = {
    id: "rpt_1",
    headline: "Weekly Visibility Report",
    periodLabel: "2026-W27",
    createdAt: "2026-07-05T00:00:00Z",
    pdfUrl: null as string | null,
    emailSentAt: null as string | null,
    reportType: "weekly",
  };

  async function renderCard(overrides: Partial<typeof BASE_REPORT> = {}) {
    const { ReportCard } = await import("@/components/domain/communication/report-card");
    return render(React.createElement(ReportCard, { report: { ...BASE_REPORT, ...overrides } }));
  }

  it("renders headline, period, and generated date", async () => {
    await renderCard({ pdfUrl: "reports/x.pdf" });
    expect(screen.getByText("Weekly Visibility Report")).toBeInTheDocument();
    expect(screen.getByText("2026-W27")).toBeInTheDocument();
    expect(screen.getByText(/5 Jul/)).toBeInTheDocument();
  });

  it("Download button is DISABLED when pdfUrl null (generating)", async () => {
    await renderCard({ pdfUrl: null });
    const btn = screen.getByRole("button", { name: /download/i });
    expect(btn).toBeDisabled();
  });

  it("Download button is ENABLED when pdfUrl set", async () => {
    await renderCard({ pdfUrl: "reports/x.pdf" });
    const btn = screen.getByRole("button", { name: /download/i });
    expect(btn).not.toBeDisabled();
  });

  it("shows status badge — Generating when pdfUrl null", async () => {
    await renderCard({ pdfUrl: null });
    expect(screen.getByText("Generating…")).toBeInTheDocument();
  });

  it("shows status badge — Ready when pdfUrl set, emailSentAt null", async () => {
    await renderCard({ pdfUrl: "reports/x.pdf", emailSentAt: null });
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows status badge — Published when emailSentAt set", async () => {
    await renderCard({ pdfUrl: "reports/x.pdf", emailSentAt: "2026-07-05" });
    expect(screen.getByText("Published")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// 3E — TierGate (Reports = Growth+ gate)
// ═══════════════════════════════════════════════════════════════

describe("Reports tab tier gate (Growth+ required)", () => {
  async function renderGate(locked: boolean) {
    const { TierGate } = await import("@/components/phase2/tier-gate");
    // Children as JSX children, not a prop (e6b29ca's noChildrenProp lint error).
    return render(
      <TierGate requiredTier="Growth" locked={locked}>
        <div data-testid="reports-content">Reports list here</div>
      </TierGate>,
    );
  }

  it("Growth+ tier (unlocked): reports content renders normally", async () => {
    await renderGate(false);
    expect(screen.getByTestId("reports-content")).toBeInTheDocument();
    expect(screen.queryByText(/plan required/i)).not.toBeInTheDocument();
  });

  it("Starter tier (locked): shows upgrade teaser, content is behind overlay", async () => {
    await renderGate(true);
    expect(screen.getByText(/Growth plan required/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upgrade/i })).toBeInTheDocument();
  });

  it("locked state: content is aria-hidden (not accessible to screen readers)", async () => {
    const { container } = await renderGate(true);
    const hiddenWrapper = container.querySelector('[aria-hidden="true"]');
    expect(hiddenWrapper).toBeTruthy();
    expect(hiddenWrapper!.textContent).toContain("Reports list here");
  });

  it("Upgrade button links to billing settings", async () => {
    const mockLocation = { href: "" };
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
    });
    const user = userEvent.setup();
    await renderGate(true);
    await user.click(screen.getByRole("button", { name: /upgrade/i }));
    expect(mockLocation.href).toBe("/settings/billing");
  });
});
