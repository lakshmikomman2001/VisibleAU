// @vitest-environment jsdom
/**
 * S01 part 9 (contract P08.checks): "Checks before this report" in the report contents panel -- only for an Enhanced
 * report; each check with its age and whether it will be reused or run again ("will run again" in --warning); the
 * directory profiles from the basis audit; the note that none of them change the Visibility score.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ReportContentsPanel } from "@/components/domain/reports/report-contents-panel";
import { TIER_DESCRIPTIONS } from "@/lib/reports/report-tiers";

const CHECKS = [
  {
    key: "identity",
    label: "Business identity (ABN)",
    status: "Checked 3 days ago · will reuse",
    willRun: false,
  },
  {
    key: "youtube",
    label: "YouTube",
    status: "No channel linked · shown as not linked",
    willRun: false,
  },
  {
    key: "crawlers",
    label: "AI crawler access",
    status: "Checked 12 days ago · will run again (about 1 minute)",
    willRun: true,
  },
  {
    key: "technical",
    label: "Website technical",
    status: "Checked 3 days ago · will reuse",
    willRun: false,
  },
  {
    key: "directories",
    label: "Your directory profiles",
    status: "From audit #52",
    willRun: false,
  },
];

function panel() {
  return (
    <ReportContentsPanel
      brandId="b1"
      brandName="TechCore IT"
      basisAuditNumber={52}
      periodLabel="2026-W47"
      agencyName="Splice Marketing"
      curated
      whatToDoNext={null}
      tierOptions={(["basic", "standard", "enhanced"] as const).map((tier) => ({
        tier,
        name: tier[0].toUpperCase() + tier.slice(1),
        description: TIER_DESCRIPTIONS[tier],
        lockedPlan: null,
      }))}
      initialTier="enhanced"
      checks={CHECKS}
      onClose={vi.fn()}
      onGenerated={vi.fn()}
    />
  );
}

beforeAll(() => {
  render(panel()).unmount();
}, 60_000);

describe("Checks before this report", () => {
  it("Enhanced: each check with its status, the directory profiles, and the note", () => {
    render(panel());
    const list = screen.getByTestId("p08-checks");
    expect(list).toHaveTextContent("Checks before this report");
    const rows = within(list).getAllByTestId("p08-check");
    expect(rows.map((r) => r.textContent)).toEqual(CHECKS.map((c) => `${c.label}${c.status}`));
    expect(within(rows[2]).getByText(CHECKS[2].status)).toHaveStyle({ color: "var(--warning)" });
    expect(list).toHaveTextContent(
      "Before an Enhanced report, checks older than their window run again. None of them change the Visibility score.",
    );
  });

  it("Standard and Basic: no checks list", () => {
    render(panel());
    fireEvent.click(screen.getByRole("radio", { name: "Standard" }));
    expect(screen.queryByTestId("p08-checks")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Basic" }));
    expect(screen.queryByTestId("p08-checks")).toBeNull();
  });
});
