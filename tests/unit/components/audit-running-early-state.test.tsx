// @vitest-environment jsdom

/**
 * URGENT audit #38 (1 Nov) -- the running page froze early: Perplexity 1
 * of 13, the other engines 0, and nothing moved again while the audit
 * finished normally in the background.
 *
 * The real component, fed audit #38's early state, on a fake clock for 3
 * simulated minutes: what it renders, how many timers and requests it
 * has out, and whether it refreshes the route. Measured on d2a1fff:
 * there's no render loop and no pile-up of timers or requests, but any
 * poll slower than 10 s was aborted and its answer thrown away, so a slow
 * endpoint left the page on its first numbers with no sign of it. Also
 * checks that odd numbers (nulls, zeros, NaN, the older row shape) never
 * reach the page.
 */
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { type ComponentProps, Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { AuditRunningView, pageNavigation } from "@/components/domain/audit/audit-running";

const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];
const BEHIND = "Still running · results will appear when done";

/** The server's first paint of audit #38: Perplexity has answered 1 of 13. */
const EARLY: ComponentProps<typeof AuditRunningView> = {
  auditId: "audit-38",
  brandId: "brand-1",
  brandName: "Omega Services",
  initialStatus: "running",
  initialProgress: (1 / 52) * 100,
  initialMentionedCount: 0,
  initialSampleCount: 1,
  initialMedianPosition: null,
  initialRankedCount: 0,
  initialCompletedCalls: 1,
  initialFailedCalls: 0,
  initialEverydayFailedCalls: 0,
  totalCalls: 52,
  engineCount: 4,
  promptCount: 13,
  runCount: 1,
  typicalDurationMinutes: null,
  errorMessage: null,
};

/** What the poll endpoint answers when `perplexity` of Perplexity's 13 calls are done. */
function earlyBody(perplexity: number, status = "running") {
  return {
    audit: {
      id: "audit-38",
      status,
      totalCalls: 52,
      engines: ENGINES,
      promptsCount: 13,
      runsPerPrompt: 1,
      metadata: {},
    },
    answeredCount: perplexity,
    failedCount: 0,
    everydayFailedCount: 0,
    costSoFarUsd: 0.01,
    costIncomplete: false,
    sampleCount: perplexity,
    mentionedCount: 0,
    medianPosition: null,
    rankedCount: 0,
    engineProgress: ENGINES.map((engine) => ({
      engine,
      done: engine === "perplexity" ? perplexity : 0,
      answered: engine === "perplexity" ? perplexity : 0,
      failed: 0,
      total: 13,
      failureReason: null,
    })),
  };
}

/**
 * A fake poll endpoint on the fake clock. `latencyMs` null never answers.
 * Tracks requests started, in flight (most at once) and aborted, and its
 * own latency timers, so the component's timers can be counted apart.
 */
function serve(opts: { latencyMs: number | null; body: () => unknown }) {
  const s = {
    started: [] as number[],
    inFlight: 0,
    maxInFlight: 0,
    aborted: 0,
    stubTimers: 0,
    signals: [] as AbortSignal[],
    latencyMs: opts.latencyMs,
  };
  global.fetch = vi.fn((_url: string, init?: RequestInit) => {
    s.started.push(Date.now());
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
        resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.body()) });
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
const reload = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(pageNavigation, "reload").mockImplementation(reload);
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = realFetch;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function renderCounted(props: Partial<typeof EARLY> = {}) {
  const counter = { renders: 0 };
  const view = render(
    <Profiler
      id="running"
      onRender={() => {
        counter.renders += 1;
      }}
    >
      <AuditRunningView {...EARLY} {...props} />
    </Profiler>,
  );
  return { counter, ...view };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Advances `seconds` one second at a time; the most component timers seen at once. */
async function runFor(seconds: number, s: ReturnType<typeof serve>) {
  let maxTimers = 0;
  for (let i = 0; i < seconds; i++) {
    await advance(1000);
    maxTimers = Math.max(maxTimers, vi.getTimerCount() - s.stubTimers);
  }
  return maxTimers;
}

describe("the running page in audit #38's early state (1 Nov)", () => {
  it("3 minutes of unchanged answers: at most 3 renders, 1 timer and 1 request, no refresh", async () => {
    const s = serve({ latencyMs: 0, body: () => earlyBody(1) });
    const { counter } = renderCounted();
    const maxTimers = await runFor(180, s);

    // Still polling the whole time (3 s, then backing off to every 10 s)...
    expect(s.started.length).toBeGreaterThanOrEqual(15);
    // ...but an unchanged answer changes nothing on the page. The renders
    // are the first paint, the poll that brought the engine rows, and at
    // most one more (React may run the component once more before it sees
    // nothing changed). d2a1fff rendered on every poll: 20 in 3 minutes.
    expect(counter.renders).toBeLessThanOrEqual(3);
    expect(maxTimers).toBeLessThanOrEqual(1);
    expect(s.maxInFlight).toBe(1);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText("1 of 52 calls finished")).toBeInTheDocument();
    const perplexity = document.querySelector('[data-engine-row="perplexity"]');
    expect(perplexity).toHaveTextContent("1 of 13 answered");
    expect(document.querySelector('[data-engine-row="chatgpt"]')).toHaveTextContent(
      "0 of 13 answered",
    );
    expect(screen.queryByText(BEHIND)).not.toBeInTheDocument();
  });

  it("answers arriving on every poll: at most one render per poll", async () => {
    let perplexity = 1;
    const s = serve({
      latencyMs: 0,
      body: () => earlyBody(Math.min(13, perplexity++)),
    });
    const { counter } = renderCounted();
    const maxTimers = await runFor(180, s);
    expect(counter.renders).toBeLessThanOrEqual(s.started.length + 1);
    expect(maxTimers).toBeLessThanOrEqual(1);
    expect(s.maxInFlight).toBe(1);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("an endpoint taking 12 s: its answers still land, the page says it's behind, and it never polls faster than every 10 s", async () => {
    let perplexity = 1;
    const s = serve({ latencyMs: 12_000, body: () => earlyBody(Math.min(13, ++perplexity)) });
    renderCounted();
    const maxTimers = await runFor(180, s);

    // On d2a1fff every one of these was aborted at 10 s and thrown away:
    // the page stayed on "1 of 52" for the whole 3 minutes.
    expect(s.aborted).toBe(0);
    expect(screen.queryByText("1 of 52 calls finished")).not.toBeInTheDocument();
    expect(screen.getByText(`${perplexity} of 52 calls finished`)).toBeInTheDocument();
    expect(screen.getByText(BEHIND)).toBeInTheDocument();
    const gaps = s.started.slice(1).map((t, i) => t - s.started[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(10_000);
    expect(s.maxInFlight).toBe(1);
    expect(maxTimers).toBeLessThanOrEqual(1);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("an endpoint that never answers: behind after 10 s, given up at 30 s, the next poll 10 s later -- one at a time", async () => {
    const s = serve({ latencyMs: null, body: () => earlyBody(1) });
    renderCounted();

    await advance(3_000); // the first poll goes out
    expect(s.started).toHaveLength(1);
    await advance(10_500);
    expect(screen.getByText(BEHIND)).toBeInTheDocument();
    expect(s.aborted).toBe(0); // still waited for

    await advance(20_000); // 30 s after it went out
    expect(s.aborted).toBe(1);
    expect(s.signals[0].aborted).toBe(true);
    await advance(9_000);
    expect(s.started).toHaveLength(1); // no faster retry
    await advance(1_000);
    expect(s.started).toHaveLength(2);
    expect(s.maxInFlight).toBe(1);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
  });

  it("back on time: the 'behind' message goes away", async () => {
    let perplexity = 1;
    const s = serve({ latencyMs: 12_000, body: () => earlyBody(++perplexity) });
    renderCounted();
    await advance(3_000 + 12_000);
    expect(screen.getByText(BEHIND)).toBeInTheDocument();

    s.latencyMs = 0; // the endpoint recovers
    await advance(10_000);
    expect(screen.queryByText(BEHIND)).not.toBeInTheDocument();
    expect(screen.getByText("3 of 52 calls finished")).toBeInTheDocument();
  });

  it("leaving the page mid-request: the request is aborted and no timer is left", async () => {
    const s = serve({ latencyMs: null, body: () => earlyBody(1) });
    const { unmount } = renderCounted();
    await advance(5_000); // a poll is out
    expect(s.inFlight).toBe(1);
    unmount();
    expect(s.signals[0].aborted).toBe(true);
    expect(s.inFlight).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await advance(60_000);
    expect(s.started).toHaveLength(1);
  });

  it("failed: polling stops and nothing is left running", async () => {
    const s = serve({ latencyMs: 0, body: () => earlyBody(1, "failed") });
    renderCounted();
    await advance(3_000);
    expect(screen.getByText("Audit failed")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    await advance(60_000);
    expect(s.started).toHaveLength(1);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("complete: no refresh while running, then at most 3 refreshes and one reload", async () => {
    let status = "running";
    serve({ latencyMs: 0, body: () => earlyBody(1, status) });
    renderCounted();
    await advance(60_000);
    expect(router.refresh).not.toHaveBeenCalled();

    status = "complete";
    await advance(10_000); // the next poll reads it
    await advance(15_000);
    expect(router.refresh).toHaveBeenCalledTimes(3);
    expect(reload).toHaveBeenCalledTimes(1);
    await advance(60_000);
    expect(router.refresh).toHaveBeenCalledTimes(3);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

/** The page's text, and the progress bars' widths, never carry NaN or Infinity. */
function expectNoBadNumbers() {
  expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/);
  for (const el of document.querySelectorAll<HTMLElement>("[style*='width']")) {
    const width = el.style.width;
    if (!width.endsWith("%")) continue;
    const pct = Number.parseFloat(width);
    expect(Number.isFinite(pct), `width ${width}`).toBe(true);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  }
}

describe("odd numbers never reach the page (1 Nov)", () => {
  async function renderWithPoll(body: unknown, props: Partial<typeof EARLY> = {}) {
    serve({ latencyMs: 0, body: () => body });
    expect(() => renderCounted(props)).not.toThrow();
    await advance(3_000);
  }

  it("nothing known yet: question count, total and engine totals all null", async () => {
    const body = earlyBody(0);
    body.audit.promptsCount = null as unknown as number;
    body.audit.totalCalls = null as unknown as number;
    for (const row of body.engineProgress) row.total = null as unknown as number;
    await renderWithPoll(body, { totalCalls: null, promptCount: null, initialProgress: 0 });
    expect(screen.getByText("Preparing your audit…")).toBeInTheDocument();
    expect(document.querySelector("[data-engine-row]")).toBeNull();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expectNoBadNumbers();
  });

  it("zeros: no questions, no engines, totals of 0 -- 'Preparing', and no '0 of 0' rows", async () => {
    const body = earlyBody(0);
    body.audit.promptsCount = 0;
    body.audit.totalCalls = 0;
    body.audit.engines = [];
    for (const row of body.engineProgress) row.total = 0;
    await renderWithPoll(body, { totalCalls: 0, promptCount: 0, engineCount: 0 });
    expect(screen.getByText("Preparing your audit…")).toBeInTheDocument();
    expect(document.querySelector("[data-engine-row]")).toBeNull();
    expectNoBadNumbers();
  });

  it("rows in the older shape (no answered, no done): 0 of 13, not 'NaN of 13'", async () => {
    const body = {
      ...earlyBody(0),
      engineProgress: ENGINES.map((engine) => ({ engine, total: 13 })),
    };
    await renderWithPoll(body);
    expect(document.querySelector('[data-engine-row="claude"]')).toHaveTextContent(
      "0 of 13 answered",
    );
    expectNoBadNumbers();
  });

  it("more answered or failed than the total: the bars stay within 0-100%", async () => {
    const body = earlyBody(0);
    body.engineProgress[3] = {
      engine: "perplexity",
      done: 25,
      answered: 20,
      failed: 5,
      total: 13,
      failureReason: null,
    };
    await renderWithPoll(body);
    expectNoBadNumbers();
  });

  it("a NaN or Infinity first paint: 0%, and the steps aren't all ticked", async () => {
    serve({ latencyMs: null, body: () => earlyBody(0) });
    renderCounted({ initialProgress: Number.NaN });
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryByText("Saving your results")?.previousElementSibling).not.toHaveTextContent(
      /./,
    );
    expectNoBadNumbers();
    renderCounted({ initialProgress: Number.POSITIVE_INFINITY });
    expectNoBadNumbers();
  });

  it("nulls and strings where numbers belong, and no audit object at all", async () => {
    await renderWithPoll({
      audit: { status: "running", totalCalls: 52, engines: ENGINES, promptsCount: 13 },
      answeredCount: null,
      failedCount: "3",
      everydayFailedCount: null,
      costSoFarUsd: "0.10",
      sampleCount: null,
      mentionedCount: null,
      medianPosition: "2",
      rankedCount: null,
      engineProgress: null,
    });
    expect(screen.getByText("0 of 52 calls finished")).toBeInTheDocument();
    expectNoBadNumbers();

    await renderWithPoll({ error: "Unauthorized" });
    expectNoBadNumbers();
  });
});
