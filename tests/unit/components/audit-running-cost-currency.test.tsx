// @vitest-environment jsdom

/**
 * "Before pushing e53edf2" (24 Oct), item 1 -- one measured cost, one currency, one conversion: the rate
 * the daily spending limit itself compares in (lib/constants/currency.ts).
 *
 * Part 14 (Sri, 13 Nov): what the calls cost us is for operators only. The running and failed views show
 * no cost at all (they showed "Cost so far: A$0.57 (counted toward today's spending limit)"), and the
 * daily limit's message tells the customer only that it's reached and when audits resume; its amounts
 * (operatorDetail) are for the operator's log and /admin, at that same rate.
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
import { DAILY_LIMIT_CUSTOMER_MESSAGE } from "@/lib/costs/customer-safe";
import { DailySpendCapExceededError } from "@/lib/platform/budget-policy.service";

const MEASURED_COST_USD = 0.37;

const PROPS = {
  auditId: "audit-1",
  brandId: "brand-1",
  brandName: "Omega Services",
  initialProgress: 38,
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

describe("Running audit: no cost for the customer (part 14, 13 Nov)", () => {
  it("converts at the daily spend cap's own rate: US$0.65 is exactly A$1.00", () => {
    expect(usdToAudCents(0.65)).toBe(100);
    expect(`A$${formatAudCents(usdToAudCents(MEASURED_COST_USD))}`).toBe("A$0.57");
  });

  it("the running card and the failed line show no cost; the failed line still says the plan isn't charged", () => {
    const running = render(<AuditRunningView {...PROPS} initialStatus="running" />);
    expect(running.queryByText("Cost so far")).toBeNull();
    expect(running.container.textContent).not.toMatch(/A\$|cost/i);
    running.unmount();

    const failed = render(
      <AuditRunningView {...PROPS} initialStatus="failed" errorMessage="Timed out" />,
    );
    expect(failed.container.textContent).not.toMatch(/A\$|Cost so far|spending limit/);
    expect(failed.container.textContent).toContain("Your subscription isn't charged per audit.");
    failed.unmount();
  });

  it("the daily limit's message has no amounts; operatorDetail has them, at the cap's own rate", () => {
    const expected = `A$${formatAudCents(usdToAudCents(MEASURED_COST_USD))}`;
    const err = new DailySpendCapExceededError({
      spentTodayCents: usdToAudCents(MEASURED_COST_USD),
      capCents: 10_000,
    });
    expect(err.message).toBe(DAILY_LIMIT_CUSTOMER_MESSAGE);
    expect(err.message).not.toMatch(/A\$|\d/);
    expect(err.operatorDetail).toBe(`Daily spending limit reached (${expected} of A$100.00).`);
  });

  it("shows no budget, projection or US$ figure on the running or the failed view", () => {
    for (const status of ["running", "failed"]) {
      const { container, unmount } = render(<AuditRunningView {...PROPS} initialStatus={status} />);
      expect(container.textContent).not.toMatch(/budget|projection|projected|US\$/i);
      unmount();
    }
  });
});
