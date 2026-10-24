// @vitest-environment jsdom

/**
 * "The Running audit page shows made-up numbers" (23 Oct), item 2c --
 * "Retry audit" already went through app/api/audits/route.ts's own
 * confirmation gate (409) and daily spend cap (429) before this task,
 * since handleRetry POSTs to that same entry point a fresh "Run
 * audit" click uses. The bug was purely client-side: `if (!res.ok)
 * throw new Error(...)` discarded the gate's own specific message,
 * so EVERY failure showed the same generic "Retry failed" text. This
 * proves both gates now surface their real message.
 */
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), refresh: vi.fn() }),
}));

import { AuditRunningView } from "@/components/domain/audit/audit-running";

const BASE_PROPS = {
  auditId: "audit-1",
  brandId: "brand-1",
  brandName: "Omega Services",
  initialStatus: "failed",
  initialProgress: 38,
  initialCost: 0.12,
  initialCostIncomplete: false,
  initialMentionedCount: 2,
  initialSampleCount: 20,
  initialMedianPosition: 3,
  initialRankedCount: 2,
  initialCompletedCalls: 20,
  totalCalls: 52,
  engineCount: 4,
  promptCount: 13,
  runCount: 1,
  typicalDurationMinutes: 12,
  errorMessage: "Timed out",
};

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  vi.clearAllMocks();
});

function stubFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe("AuditRunningView -- Retry audit surfaces the real entry-point gate message (23 Oct, item 2c)", () => {
  it("shows the confirmation-gate's own message on a 409, not the generic fallback", async () => {
    stubFetchOnce(409, {
      error: "brand_needs_confirmation",
      message: "Confirm your business type and location before running an audit.",
    });
    render(<AuditRunningView {...BASE_PROPS} />);

    screen.getByText("Retry audit").click();

    await waitFor(() => {
      expect(
        screen.getByText("Confirm your business type and location before running an audit."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Retry failed/)).not.toBeInTheDocument();
  });

  it("shows the daily spend cap's own message on a 429, not the generic fallback", async () => {
    stubFetchOnce(429, {
      error: "daily_spend_cap_exceeded",
      message:
        "Daily spending limit reached (A$100.12 of A$100.00); audits resume after midnight (Sydney time).",
    });
    render(<AuditRunningView {...BASE_PROPS} />);

    screen.getByText("Retry audit").click();

    await waitFor(() => {
      expect(
        screen.getByText(
          "Daily spending limit reached (A$100.12 of A$100.00); audits resume after midnight (Sydney time).",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Retry failed/)).not.toBeInTheDocument();
  });

  it("falls back to the generic message for a response with no gate message", async () => {
    stubFetchOnce(500, {});
    render(<AuditRunningView {...BASE_PROPS} />);

    screen.getByText("Retry audit").click();

    await waitFor(() => {
      expect(
        screen.getByText("Retry failed — please try again from the brand page."),
      ).toBeInTheDocument();
    });
  });
});
