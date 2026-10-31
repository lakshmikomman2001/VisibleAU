// @vitest-environment jsdom

/**
 * URGENT audit #37 (31 Oct), item 4 -- the running page's "Mentions found"
 * card said "across 30 answers to everyday questions". That was right (40
 * everyday answers less the failed engine's 10), but it didn't say why
 * it wasn't 40. With failures it now reads "across 30 successful answers
 * to everyday questions (10 failed)".
 */
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { AuditRunningView } from "@/components/domain/audit/audit-running";

const PROPS = {
  auditId: "audit-37",
  brandId: "brand-1",
  brandName: "Omega Services",
  initialStatus: "running",
  initialProgress: 100,
  initialCost: 0.1,
  initialCostIncomplete: false,
  initialMentionedCount: 5,
  initialSampleCount: 30,
  initialMedianPosition: null,
  initialRankedCount: 0,
  initialCompletedCalls: 52,
  initialFailedCalls: 13,
  totalCalls: 52,
  engineCount: 4,
  promptCount: 13,
  runCount: 1,
  typicalDurationMinutes: null,
  errorMessage: null,
};

const realFetch = global.fetch;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  global.fetch = realFetch;
  vi.clearAllMocks();
});

describe("'Mentions found' says when everyday answers failed (31 Oct, item 4)", () => {
  it("with failures: 'across 30 successful answers to everyday questions (10 failed)'", () => {
    render(<AuditRunningView {...PROPS} initialEverydayFailedCalls={10} />);
    expect(
      screen.getByText("across 30 successful answers to everyday questions (10 failed)"),
    ).toBeInTheDocument();
  });

  it("without failures: unchanged", () => {
    render(<AuditRunningView {...PROPS} initialFailedCalls={0} initialEverydayFailedCalls={0} />);
    expect(screen.getByText("across 30 answers to everyday questions")).toBeInTheDocument();
  });

  it("follows the poll", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          audit: {
            status: "running",
            totalCalls: 52,
            engines: ["chatgpt"],
            promptsCount: 13,
            runsPerPrompt: 1,
            metadata: {},
          },
          answeredCount: 52,
          failedCount: 13,
          everydayFailedCount: 10,
          sampleCount: 30,
          mentionedCount: 5,
          medianPosition: null,
          rankedCount: 0,
          engineProgress: [],
        }),
    }) as unknown as typeof fetch;
    render(<AuditRunningView {...PROPS} initialEverydayFailedCalls={0} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(
      screen.getByText("across 30 successful answers to everyday questions (10 failed)"),
    ).toBeInTheDocument();
  });
});
