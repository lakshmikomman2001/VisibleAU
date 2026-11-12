// @vitest-environment jsdom

/**
 * URGENT audit #37 (31 Oct), item 3 -- the running page gets to the
 * finished view by itself. Production stayed on "Audit in progress" after
 * the audit completed: the page refreshed the route ONCE when a poll first
 * read "complete", and stopped polling in the same moment, so if that one
 * refresh didn't bring back the finished view nothing ever tried again.
 *
 * Fake clock: the poll answers "complete", and the route refresh is a spy
 * that never swaps the view (the component stays mounted) -- the page must
 * keep refreshing, and reload as a last resort, within 15 s.
 */
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import {
  AuditRunningView,
  nextPollDelayMs,
  pageNavigation,
} from "@/components/domain/audit/audit-running";

const PROPS = {
  auditId: "audit-37",
  brandId: "brand-1",
  brandName: "Omega Services",
  initialStatus: "running",
  initialProgress: 100,
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

function pollBody(status: string) {
  return {
    audit: {
      id: "audit-37",
      status,
      totalCalls: 52,
      engines: ["chatgpt", "claude", "gemini", "perplexity"],
      promptsCount: 13,
      runsPerPrompt: 1,
      metadata: {},
    },
    answeredCount: 52,
    failedCount: 13,
    costSoFarUsd: 0.1,
    costIncomplete: false,
    sampleCount: 30,
    mentionedCount: 5,
    medianPosition: null,
    rankedCount: 0,
    engineProgress: [],
  };
}

const realFetch = global.fetch;
const reload = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  // A full reload can't run in jsdom; the page calls it through
  // pageNavigation so it can be watched here.
  if (pageNavigation) vi.spyOn(pageNavigation, "reload").mockImplementation(reload);
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = realFetch;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function stubPoll(status: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(pollBody(status)),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("AuditRunningView -- switches to the results by itself (31 Oct, item 3)", () => {
  it("polls without any cache, and with a time limit", async () => {
    const fetchMock = stubPoll("running");
    render(<AuditRunningView {...PROPS} />);
    await advance(3000);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/audits/audit-37",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });

  it("once complete: says so, refreshes again until the results replace it, then reloads -- all within 15 s", async () => {
    stubPoll("complete");
    render(<AuditRunningView {...PROPS} />);

    await advance(3000); // the first poll reads "complete"
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Audit complete")).toBeInTheDocument();
    expect(screen.queryByText("Audit in progress")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show the results" })).toHaveAttribute(
      "href",
      "/audits/audit-37",
    );

    await advance(4000);
    expect(router.refresh).toHaveBeenCalledTimes(2);
    await advance(4000);
    expect(router.refresh).toHaveBeenCalledTimes(3);
    expect(reload).not.toHaveBeenCalled();

    // Still not swapped 12 s after "complete": a full reload, once.
    await advance(4000);
    expect(reload).toHaveBeenCalledTimes(1);
    await advance(20000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("when the results arrive (this view unmounts), the retries stop", async () => {
    stubPoll("complete");
    const { unmount } = render(<AuditRunningView {...PROPS} />);
    await advance(3000);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    unmount();
    await advance(30000);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("failed: the failed view straight from the poll, no refresh needed", async () => {
    stubPoll("failed");
    render(<AuditRunningView {...PROPS} />);
    await advance(3000);
    expect(screen.getByText("Audit failed")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("nextPollDelayMs", () => {
  it("backs off by 1.4x to a 10 s cap, so a finish is noticed within 10 s mid-run", () => {
    let delay = 3000;
    const seen: number[] = [];
    for (let i = 0; i < 10; i++) {
      delay = nextPollDelayMs(delay, false);
      seen.push(delay);
    }
    expect(seen.slice(0, 3)).toEqual([4200, 5880, 8232]);
    expect(Math.max(...seen)).toBe(10000);
  });

  it("every 3 s once every call has finished -- the audit is about to complete", () => {
    expect(nextPollDelayMs(10000, true)).toBe(3000);
  });
});
