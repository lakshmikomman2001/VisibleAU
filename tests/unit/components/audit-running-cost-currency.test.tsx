// @vitest-environment jsdom

/**
 * "Before pushing e53edf2" (24 Oct), item 1 -- one measured cost, one
 * currency, one conversion. The running page's "Cost so far" card, the
 * failed page's "Cost so far" line and the 429 daily-spend-cap message
 * all show the same A$ figure for the same cost, converted at the rate
 * the cap itself compares in (lib/constants/currency.ts). The running
 * page shows only what has been measured: no budget, no projection.
 */
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/db/client", () => ({ db: {}, serviceDb: {} }));

import { AuditRunningView } from "@/components/domain/audit/audit-running";
import { formatAudCents, usdToAudCents } from "@/lib/constants/currency";
import { DailySpendCapExceededError } from "@/lib/platform/budget-policy.service";

const MEASURED_COST_USD = 0.37;

const PROPS = {
  auditId: "audit-1",
  brandId: "brand-1",
  brandName: "Omega Services",
  initialProgress: 38,
  initialCost: MEASURED_COST_USD,
  initialMentionedCount: 1,
  initialSampleCount: 18,
  initialMedianPosition: 3,
  initialRankedCount: 1,
  initialCompletedCalls: 20,
  totalCalls: 52,
  engineCount: 4,
  promptCount: 13,
  runCount: 1,
  typicalDurationMinutes: 12,
  errorMessage: null,
};

describe("Running-audit cost: measured only, one currency (24 Oct, item 1)", () => {
  it("converts at the daily spend cap's own rate: US$0.65 is exactly A$1.00", () => {
    expect(usdToAudCents(0.65)).toBe(100);
    expect(`A$${formatAudCents(usdToAudCents(MEASURED_COST_USD))}`).toBe("A$0.57");
  });

  it("the running card, the failed line and the 429 message show the same A$ figure for the same cost", () => {
    const expected = `A$${formatAudCents(usdToAudCents(MEASURED_COST_USD))}`;

    const running = render(<AuditRunningView {...PROPS} initialStatus="running" />);
    expect(running.getByText("Cost so far")).toBeInTheDocument();
    expect(running.getByText(expected)).toBeInTheDocument();
    running.unmount();

    const failed = render(
      <AuditRunningView {...PROPS} initialStatus="failed" errorMessage="Timed out" />,
    );
    expect(failed.container.textContent).toContain(
      `Cost so far: ${expected} (counted toward today's spending limit).`,
    );
    failed.unmount();

    // record() stores the same measured cost through usdToAudCents;
    // checkDailySpend() hands those AUD-cent totals straight to the error.
    const message = new DailySpendCapExceededError({
      spentTodayCents: usdToAudCents(MEASURED_COST_USD),
      capCents: 10_000,
    }).message;
    expect(message).toBe(
      `Daily spending limit reached (${expected} of A$100.00); audits resume after midnight (Sydney time).`,
    );
  });

  it("shows no budget, projection or US$ figure on the running or the failed view", () => {
    for (const status of ["running", "failed"]) {
      const { container, unmount } = render(<AuditRunningView {...PROPS} initialStatus={status} />);
      expect(container.textContent).not.toMatch(/budget|projection|projected|US\$/i);
      unmount();
    }
  });
});
