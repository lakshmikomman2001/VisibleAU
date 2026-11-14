// @vitest-environment jsdom

/**
 * URGENT audit #38 follow-up (1 Nov) -- the other pages that poll get the
 * running-audit page's safety (aa547c4, now lib/hooks/use-safe-poll.ts).
 * Each used to poll on a fixed setInterval with no time limit, so a slow
 * endpoint stacked up requests:
 * - the public sample audit's running page (every 3 s; on "complete" it
 *   navigated once and stopped, the one-shot pattern that left audit
 *   #37's page stuck);
 * - a report's page while its PDF generates (every 4 s, forever if it
 *   never arrived);
 * - the reports list while any report generates (every 4 s).
 *
 * The real pages, on a fake clock, against a fake endpoint that can be
 * slow (12 s), never answer, fail, or keep saying "still generating".
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ brandId: "brand-1", reportId: "report-1" }),
  useSearchParams: () => ({ get: (key: string) => (key === "auditId" ? "audit-1" : null) }),
  usePathname: () => "/brands/brand-1/reports",
}));

import ReportDetailPage from "@/app/(auth)/brands/[brandId]/reports/[reportId]/page";
import ReportsListPage from "@/app/(auth)/brands/[brandId]/reports/page";
import SampleAuditRunningPage from "@/app/(marketing)/sample-audit/running/page";
import { REPORT_MAX_WAIT_MS } from "@/lib/communication/report-poll";
import { pageNavigation } from "@/lib/hooks/use-safe-poll";

const STILL_WORKING = "Still working · this will update when done";
const TAKING_LONGER = "Taking longer than expected · please check back later";

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

/**
 * A fake endpoint on the fake clock. Polls (`isPoll`) answer after
 * `latencyMs` (null: never), or fail with a network error while
 * `failNext` > 0; anything else (a page's first load, a POST) answers at
 * once. Tracks polls started, in flight (most at once) and aborted, and
 * its own latency timers, so the page's timers can be counted apart.
 */
function serve(opts: {
  latencyMs: number | null;
  poll: () => unknown;
  initial?: () => unknown;
  isPoll: (init?: RequestInit) => boolean;
}) {
  const s = {
    started: [] as number[],
    inFlight: 0,
    maxInFlight: 0,
    aborted: 0,
    stubTimers: 0,
    failNext: 0,
    signals: [] as AbortSignal[],
    latencyMs: opts.latencyMs,
    posts: 0,
  };
  global.fetch = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      s.posts += 1;
      return Promise.resolve({ ok: true, status: 202, json: () => Promise.resolve({}) });
    }
    if (!opts.isPoll(init)) return Promise.resolve(okResponse(opts.initial?.()));
    s.started.push(Date.now());
    if (s.failNext > 0) {
      s.failNext -= 1;
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    s.inFlight += 1;
    s.maxInFlight = Math.max(s.maxInFlight, s.inFlight);
    const signal = init?.signal ?? undefined;
    if (signal) s.signals.push(signal);
    return new Promise((resolve, reject) => {
      let settled = false;
      const answer = () => {
        if (settled) return;
        settled = true;
        s.inFlight -= 1;
        resolve(okResponse(opts.poll()));
      };
      signal?.addEventListener("abort", () => {
        if (settled) return;
        settled = true;
        s.inFlight -= 1;
        s.aborted += 1;
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
      if (s.latencyMs === 0) {
        answer();
      } else if (s.latencyMs !== null) {
        s.stubTimers += 1;
        setTimeout(() => {
          s.stubTimers -= 1;
          answer();
        }, s.latencyMs);
      }
    });
  }) as unknown as typeof fetch;
  return s;
}

const realFetch = global.fetch;
const assign = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(pageNavigation, "assign").mockImplementation(assign);
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = realFetch;
  vi.restoreAllMocks();
  vi.clearAllMocks();
  router.push.mockReset();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Advances `seconds` one second at a time; the most page timers seen at once. */
async function runFor(seconds: number, s: ReturnType<typeof serve>) {
  let maxTimers = 0;
  for (let i = 0; i < seconds; i++) {
    await advance(1000);
    maxTimers = Math.max(maxTimers, vi.getTimerCount() - s.stubTimers);
  }
  return maxTimers;
}

function gapsBetween(times: number[]) {
  return times.slice(1).map((t, i) => t - times[i]);
}

// ---------------------------------------------------------------------------
// The public sample audit (app/(marketing)/sample-audit/running/page.tsx)
// ---------------------------------------------------------------------------

function sampleBody(answeredCount: number, status = "running") {
  return { status, answeredCount, totalCalls: 52 };
}

/** Every GET the sample page makes is a poll. */
const samplePoll = () => true;

describe("the sample audit's running page (public, the lead funnel)", () => {
  it("an endpoint taking 12 s: one request in flight, its answers land, it says it's behind, and never polls faster than every 10 s", async () => {
    let answered = 0;
    const s = serve({
      latencyMs: 12_000,
      poll: () => {
        answered = Math.min(52, answered + 4);
        return sampleBody(answered);
      },
      isPoll: samplePoll,
    });
    render(<SampleAuditRunningPage />);
    const maxTimers = await runFor(180, s);

    // The old 3 s setInterval had 4 or 5 of these out at once.
    expect(s.maxInFlight).toBe(1);
    expect(s.aborted).toBe(0);
    expect(Math.min(...gapsBetween(s.started))).toBeGreaterThanOrEqual(10_000);
    expect(maxTimers).toBeLessThanOrEqual(1);
    expect(screen.getByText(`${answered} of 52 answers received`)).toBeInTheDocument();
    expect(screen.getByText(STILL_WORKING)).toBeInTheDocument();
  });

  it("an endpoint that never answers: the message after 10 s, given up at 30 s, the next poll 10 s later", async () => {
    const s = serve({ latencyMs: null, poll: () => sampleBody(0), isPoll: samplePoll });
    render(<SampleAuditRunningPage />);
    await advance(100); // the first poll goes out at once
    expect(s.started).toHaveLength(1);
    expect(screen.queryByText(STILL_WORKING)).not.toBeInTheDocument();

    await advance(10_000);
    expect(screen.getByText(STILL_WORKING)).toBeInTheDocument();
    expect(s.aborted).toBe(0); // still waited for

    await advance(20_000); // 30 s after it went out
    expect(s.aborted).toBe(1);
    expect(s.signals[0].aborted).toBe(true);
    await advance(9_000);
    expect(s.started).toHaveLength(1); // no faster retry
    await advance(1_000);
    expect(s.started).toHaveLength(2);
    expect(s.maxInFlight).toBe(1);
  });

  it("complete, and the navigation never happens: it tries 3 times, 4 s apart, then loads the results page in full -- once", async () => {
    const s = serve({ latencyMs: 0, poll: () => sampleBody(52, "complete"), isPoll: samplePoll });
    render(<SampleAuditRunningPage />);
    await advance(100);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/sample-audit/result/audit-1");

    await advance(4_000);
    expect(router.push).toHaveBeenCalledTimes(2); // the old page navigated once and stopped
    await advance(4_000);
    expect(router.push).toHaveBeenCalledTimes(3);
    expect(assign).not.toHaveBeenCalled();
    await advance(4_000);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/sample-audit/result/audit-1");

    await advance(60_000);
    expect(router.push).toHaveBeenCalledTimes(3);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(s.started).toHaveLength(1); // polling stopped at "complete"
    expect(vi.getTimerCount()).toBe(0);
    // Meanwhile the page says it's done, with a link (the old one sat on
    // "Running your audit...").
    expect(screen.getByText("Your audit is ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See your results" })).toHaveAttribute(
      "href",
      "/sample-audit/result/audit-1",
    );
  });

  it("complete, the first navigation fails and the second works: no more attempts once the page has gone", async () => {
    serve({ latencyMs: 0, poll: () => sampleBody(52, "complete"), isPoll: samplePoll });
    router.push.mockImplementationOnce(() => {
      throw new Error("navigation failed");
    });
    const { unmount } = render(<SampleAuditRunningPage />);
    await advance(100);
    expect(router.push).toHaveBeenCalledTimes(1);

    await advance(4_000);
    expect(router.push).toHaveBeenCalledTimes(2);
    unmount(); // the results page replaced this one
    await advance(20_000);
    expect(router.push).toHaveBeenCalledTimes(2);
    expect(assign).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("failed: polling stops and nothing is left running", async () => {
    const s = serve({ latencyMs: 0, poll: () => sampleBody(10, "failed"), isPoll: samplePoll });
    render(<SampleAuditRunningPage />);
    await advance(100);
    expect(screen.getByText("This audit timed out")).toBeInTheDocument();
    await advance(60_000);
    expect(s.started).toHaveLength(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A report while its PDF generates (app/(auth)/brands/[brandId]/reports/[reportId]/page.tsx)
// ---------------------------------------------------------------------------

function reportBody(pdfUrl: string | null) {
  return {
    id: "report-1",
    headline: "Omega Services: week 44",
    narrativeText: "Visibility held steady this week.",
    periodLabel: "2026-W44",
    reportType: "weekly",
    pdfUrl,
    emailSentAt: null,
    keyWins: null,
    keyGaps: null,
    fanOutSummary: null,
    topicalSummary: null,
    mentionSourceSummary: null,
    confidenceNotes: null,
    createdAt: "2026-11-01T02:00:00.000Z",
  };
}

/** The page's first load is a plain fetch; its polls ask for no-store. */
const reportPoll = (init?: RequestInit) => init?.cache === "no-store";

describe("a report's page while its PDF generates", () => {
  it("an endpoint taking 12 s: one request in flight, and it says it's behind", async () => {
    const s = serve({
      latencyMs: 12_000,
      initial: () => reportBody(null),
      poll: () => reportBody(null),
      isPoll: reportPoll,
    });
    render(<ReportDetailPage />);
    await advance(0); // the page's first load lands
    const maxTimers = await runFor(180, s);

    // The old 4 s setInterval had 3 of these out at once.
    expect(s.maxInFlight).toBe(1);
    expect(s.aborted).toBe(0);
    expect(Math.min(...gapsBetween(s.started))).toBeGreaterThanOrEqual(10_000);
    expect(maxTimers).toBeLessThanOrEqual(1);
    expect(screen.getByText(STILL_WORKING)).toBeInTheDocument();
  });

  it("an endpoint that never answers: the message after 10 s, given up at 30 s, the next poll 10 s later", async () => {
    const s = serve({
      latencyMs: null,
      initial: () => reportBody(null),
      poll: () => reportBody(null),
      isPoll: reportPoll,
    });
    render(<ReportDetailPage />);
    await advance(0); // the page's first load lands
    await advance(4_000); // the first poll goes out
    expect(s.started).toHaveLength(1);
    await advance(10_500);
    expect(screen.getByText(STILL_WORKING)).toBeInTheDocument();
    expect(s.aborted).toBe(0);

    await advance(20_000); // 30 s after it went out
    expect(s.aborted).toBe(1);
    await advance(9_000);
    expect(s.started).toHaveLength(1);
    await advance(1_000);
    expect(s.started).toHaveLength(2);
    expect(s.maxInFlight).toBe(1);
  });

  it("the PDF arrives on the poll after a failed one: it shows, and polling stops", async () => {
    const s = serve({
      latencyMs: 0,
      initial: () => reportBody(null),
      poll: () => reportBody("org-1/report-1.pdf"),
      isPoll: reportPoll,
    });
    s.failNext = 1;
    render(<ReportDetailPage />);
    await advance(0); // the page's first load lands
    await advance(4_000); // fails
    expect(screen.queryByText("Download PDF")).not.toBeInTheDocument();
    await advance(4_000);
    expect(screen.getAllByText("Download PDF").length).toBeGreaterThan(0);
    await advance(60_000);
    expect(s.started).toHaveLength(2);
    expect(screen.queryByText(STILL_WORKING)).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  // 14 Nov, part 6: 12 minutes -- past the 10 after which the server marks it failed (REPORT_PDF_STALLED_MS).
  it("a PDF that never arrives: polling stops after 12 minutes, and the page says so", async () => {
    const s = serve({
      latencyMs: 0,
      initial: () => reportBody(null),
      poll: () => reportBody(null),
      isPoll: reportPoll,
    });
    render(<ReportDetailPage />);
    await advance(0); // the page's first load lands
    await advance(REPORT_MAX_WAIT_MS - 1_000);
    expect(screen.queryByText(TAKING_LONGER)).not.toBeInTheDocument();
    await advance(2_000);
    expect(screen.getByText(TAKING_LONGER)).toBeInTheDocument();
    const polls = s.started.length;
    expect(polls).toBeGreaterThan(100); // every 4 s until then

    await advance(30 * 60_000);
    expect(s.started).toHaveLength(polls); // the old page polled forever
    expect(vi.getTimerCount()).toBe(0);
    expect(s.maxInFlight).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The reports list while a report generates (app/(auth)/brands/[brandId]/reports/page.tsx)
// ---------------------------------------------------------------------------

function reportRow(pdfUrl: string | null) {
  return {
    id: "report-1",
    headline: "Omega Services: week 44",
    periodLabel: "2026-W44",
    reportType: "weekly",
    pdfUrl,
    emailSentAt: null,
    createdAt: "2026-11-01T02:00:00.000Z",
  };
}

describe("the reports list while a report generates", () => {
  it("an endpoint taking 12 s: one request in flight, and it says it's behind", async () => {
    const s = serve({
      latencyMs: 12_000,
      initial: () => [reportRow(null)],
      poll: () => [reportRow(null)],
      isPoll: reportPoll,
    });
    render(<ReportsListPage />);
    await advance(0); // the page's first load lands
    const maxTimers = await runFor(180, s);

    expect(s.maxInFlight).toBe(1);
    expect(s.aborted).toBe(0);
    expect(Math.min(...gapsBetween(s.started))).toBeGreaterThanOrEqual(10_000);
    expect(maxTimers).toBeLessThanOrEqual(1);
    expect(screen.getByText(STILL_WORKING)).toBeInTheDocument();
  });

  it("an endpoint that never answers: the message after 10 s, given up at 30 s, the next poll 10 s later", async () => {
    const s = serve({
      latencyMs: null,
      initial: () => [reportRow(null)],
      poll: () => [reportRow(null)],
      isPoll: reportPoll,
    });
    render(<ReportsListPage />);
    await advance(0); // the page's first load lands
    await advance(4_000);
    expect(s.started).toHaveLength(1);
    await advance(10_500);
    expect(screen.getByText(STILL_WORKING)).toBeInTheDocument();
    expect(s.aborted).toBe(0);

    await advance(20_000);
    expect(s.aborted).toBe(1);
    await advance(9_000);
    expect(s.started).toHaveLength(1);
    await advance(1_000);
    expect(s.started).toHaveLength(2);
    expect(s.maxInFlight).toBe(1);
  });

  it("the PDF arrives on the poll after a failed one: it shows, and polling stops", async () => {
    const s = serve({
      latencyMs: 0,
      initial: () => [reportRow(null)],
      poll: () => [reportRow("org-1/report-1.pdf")],
      isPoll: reportPoll,
    });
    s.failNext = 1;
    render(<ReportsListPage />);
    await advance(0); // the page's first load lands
    await advance(4_000);
    expect(screen.getByText("Pending...")).toBeInTheDocument();
    await advance(4_000);
    expect(screen.getByText("Download PDF")).toBeInTheDocument();
    await advance(60_000);
    expect(s.started).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a report that never finishes: polling stops after 12 minutes and the page says so; 'Generate report' starts again", async () => {
    const s = serve({
      latencyMs: 0,
      initial: () => [reportRow(null)],
      poll: () => [reportRow(null)],
      isPoll: reportPoll,
    });
    render(<ReportsListPage />);
    await advance(0); // the page's first load lands
    await advance(REPORT_MAX_WAIT_MS - 1_000);
    expect(screen.queryByText(TAKING_LONGER)).not.toBeInTheDocument();
    await advance(2_000);
    expect(screen.getByText(TAKING_LONGER)).toBeInTheDocument();
    const polls = s.started.length;
    await advance(30 * 60_000);
    expect(s.started).toHaveLength(polls);
    expect(vi.getTimerCount()).toBe(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
    });
    await advance(100);
    expect(s.posts).toBe(1);
    expect(screen.queryByText(TAKING_LONGER)).not.toBeInTheDocument();
    await advance(4_000);
    expect(s.started).toHaveLength(polls + 1);
    expect(s.maxInFlight).toBe(1);
  });
});
