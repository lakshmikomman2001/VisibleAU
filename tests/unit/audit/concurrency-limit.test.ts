import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENGINE_CALL_CONCURRENCY, pLimit } from "@/lib/audit/concurrency-limit";

describe("pLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function delayedTask(ms: number, active: { count: number; max: number }) {
    return () =>
      new Promise<number>((resolve) => {
        active.count++;
        active.max = Math.max(active.max, active.count);
        setTimeout(() => {
          active.count--;
          resolve(ms);
        }, ms);
      });
  }

  it("never runs more than `concurrency` tasks at once", async () => {
    const limit = pLimit(3);
    const active = { count: 0, max: 0 };
    const tasks = Array.from({ length: 10 }, () => limit(delayedTask(100, active)));

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(tasks);

    expect(active.max).toBeLessThanOrEqual(3);
    expect(active.max).toBe(3); // with 10 tasks and limit 3, it should actually reach the cap
  });

  it("eventually runs every queued task", async () => {
    const limit = pLimit(2);
    const active = { count: 0, max: 0 };
    const tasks = Array.from({ length: 5 }, (_, i) => limit(delayedTask(10 * (i + 1), active)));

    await vi.advanceTimersByTimeAsync(1000);
    const results = await Promise.all(tasks);

    expect(results).toHaveLength(5);
    expect(active.count).toBe(0); // every task finished, none still "running"
  });

  it("concurrency: Infinity (the default for every caller that doesn't opt in) never queues anything", async () => {
    const limit = pLimit(Infinity);
    const active = { count: 0, max: 0 };
    const tasks = Array.from({ length: 50 }, () => limit(delayedTask(50, active)));

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(tasks);

    expect(active.max).toBe(50); // all 50 ran at once, nothing bounded
  });

  it("a rejected task still frees its concurrency slot for the next queued one", async () => {
    const limit = pLimit(1);
    const order: string[] = [];

    const failing = limit(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("boom")), 10);
        }),
    );
    const succeeding = limit(() => {
      order.push("second ran");
      return Promise.resolve("ok");
    });

    // Attach the rejection assertion BEFORE advancing timers -- the
    // rejection can fire mid-advance, and a handler attached only
    // afterwards races it (a real, if harmless, unhandled-rejection
    // warning, not a correctness bug in pLimit itself).
    const failingAssertion = expect(failing).rejects.toThrow("boom");
    await vi.advanceTimersByTimeAsync(100);
    await failingAssertion;
    await expect(succeeding).resolves.toBe("ok");
    expect(order).toEqual(["second ran"]);
  });

  it("rejects construction with a concurrency below 1", () => {
    expect(() => pLimit(0)).toThrow(/concurrency must be >= 1/);
  });
});

describe("per-call timeout is respected under a concurrency limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Mirrors the real shape in lib/llm/openai-impl.ts / perplexity-impl.ts:
  // each call races its own work against a fixed timeout, independent of
  // how many OTHER calls are queued behind the same concurrency limiter.
  function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      work.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  it("a slow call times out on its own schedule, without blocking queued calls behind it", async () => {
    const limit = pLimit(1);
    const slow = limit(() => withTimeout(new Promise((r) => setTimeout(() => r("late"), 60_000)), 30_000));
    const next = limit(() => Promise.resolve("fast"));

    const slowAssertion = expect(slow).rejects.toThrow(/timed out after 30000ms/);
    await vi.advanceTimersByTimeAsync(30_000);
    await slowAssertion;
    await expect(next).resolves.toBe("fast");
  });
});

// "Audits time out on Vercel" follow-up, item 3 -- the exact
// orchestration pattern inngest/functions/run-audit.ts and lib/audit/
// run-audit-inline.ts both now use: one pLimit(ENGINE_CALL_CONCURRENCY)
// instance PER engine (never one shared across all four), with the 4
// engines themselves run via Promise.all so they're fully concurrent
// with each other.
describe("the per-engine pLimit + Promise.all-across-engines pattern", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function delay<T>(ms: number, value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), ms));
  }

  // One pLimit per engine + Promise.all across engines, exactly
  // mirroring runEngine()/runOneCall() in inngest/functions/run-
  // audit.ts (and lib/audit/run-audit-inline.ts's matching
  // runEngine()/runOneCall()).
  async function runAllEngines(
    engineCallMs: Record<string, number[]>,
    concurrency: number,
  ): Promise<Record<string, number[]>> {
    const engines = Object.keys(engineCallMs);
    const perEngine = await Promise.all(
      engines.map(async (engine) => {
        const limit = pLimit(concurrency);
        const calls = engineCallMs[engine].map((ms, i) => limit(() => delay(ms, i)));
        return Promise.all(calls);
      }),
    );
    return Object.fromEntries(engines.map((engine, e) => [engine, perEngine[e]]));
  }

  it("4 engines run concurrently -- total wall time is about the SLOWEST engine, not the sum of all four", async () => {
    // 13 calls each, same shape as a real audit -- chatgpt is the
    // slow one (1s per call, unbounded by the 3-per-engine cap would
    // still take ceil(13/3)=5 batches x 1s = 5s), the other three are
    // fast (10ms/call). Sequentially summed, this would be
    // 13*(1000+10+10+10) = 13.26s; concurrently, it should finish in
    // close to chatgpt's own ~5s, never anywhere near the sum.
    const engineCallMs: Record<string, number[]> = {
      chatgpt: Array.from({ length: 13 }, () => 1000),
      claude: Array.from({ length: 13 }, () => 10),
      gemini: Array.from({ length: 13 }, () => 10),
      perplexity: Array.from({ length: 13 }, () => 10),
    };

    const resultPromise = runAllEngines(engineCallMs, ENGINE_CALL_CONCURRENCY);
    // Fast-forward exactly as far as chatgpt alone would need
    // (5 batches of 3-at-a-time x 1000ms = 5000ms) -- if the engines
    // were still running sequentially (claude/gemini/perplexity's
    // ~130ms each only starting after chatgpt's own ~13s finished),
    // this would NOT be enough time and the promise would still be
    // pending.
    await vi.advanceTimersByTimeAsync(5_000);
    const results = await resultPromise;

    expect(results.chatgpt).toHaveLength(13);
    expect(results.claude).toHaveLength(13);
    expect(results.gemini).toHaveLength(13);
    expect(results.perplexity).toHaveLength(13);
  });

  it(`per-engine concurrency is respected -- never more than ${ENGINE_CALL_CONCURRENCY} of ONE engine's own calls in flight at once`, async () => {
    const active: Record<string, { count: number; max: number }> = {
      chatgpt: { count: 0, max: 0 },
      claude: { count: 0, max: 0 },
    };
    function tracked(engine: string, ms: number) {
      active[engine].count++;
      active[engine].max = Math.max(active[engine].max, active[engine].count);
      return delay(ms, null).then((v) => {
        active[engine].count--;
        return v;
      });
    }

    const engines = ["chatgpt", "claude"];
    const resultPromise = Promise.all(
      engines.map(async (engine) => {
        const limit = pLimit(ENGINE_CALL_CONCURRENCY);
        const calls = Array.from({ length: 10 }, () => limit(() => tracked(engine, 50)));
        return Promise.all(calls);
      }),
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await resultPromise;

    expect(active.chatgpt.max).toBeLessThanOrEqual(ENGINE_CALL_CONCURRENCY);
    expect(active.chatgpt.max).toBe(ENGINE_CALL_CONCURRENCY); // with 10 calls and the real cap, it should actually reach it
    expect(active.claude.max).toBeLessThanOrEqual(ENGINE_CALL_CONCURRENCY);
  });

  it("a persistently-failing engine (simulating a 429 retried out) never stalls the other three -- they finish on their own schedule regardless", async () => {
    const engineCallMs: Record<string, number[]> = {
      chatgpt: Array.from({ length: 13 }, () => 10),
      claude: Array.from({ length: 13 }, () => 10),
      gemini: Array.from({ length: 13 }, () => 10),
    };
    // perplexity: every call "retries" a 429 for a full 2s (mirrors a
    // real rate_limited call's own worst case: 30s timeout + backoff,
    // scaled down for a fast test) before finally failing -- modelled
    // as a rejected promise per call-slot, same as a real
    // callWithRetry() failure the step still records and moves past,
    // never something that blocks the OTHER steps already running.
    const limit = pLimit(ENGINE_CALL_CONCURRENCY);
    const perplexityCalls = Array.from({ length: 13 }, () =>
      limit(() =>
        delay(2_000, null).then(() => {
          throw new Error("429 retried out");
        }),
      ).catch((e: Error) => ({ failed: true, message: e.message })),
    );

    const otherEnginesPromise = runAllEngines(engineCallMs, ENGINE_CALL_CONCURRENCY);
    const perplexityPromise = Promise.all(perplexityCalls);

    // The three fast engines (13 calls x 10ms, bounded at
    // ENGINE_CALL_CONCURRENCY) finish in well under 1s -- long before
    // perplexity's own 2s-per-call failures resolve at all.
    await vi.advanceTimersByTimeAsync(500);
    const otherResults = await otherEnginesPromise;
    expect(otherResults.chatgpt).toHaveLength(13);
    expect(otherResults.claude).toHaveLength(13);
    expect(otherResults.gemini).toHaveLength(13);

    // perplexity's own failures resolve on their own schedule,
    // independently -- never blocking (and never blocked by) the
    // three engines that already finished above. 13 calls at
    // ENGINE_CALL_CONCURRENCY-at-a-time is ceil(13/3) = 5 waves of
    // 2s each.
    await vi.advanceTimersByTimeAsync(5 * 2_000);
    const perplexityResults = await perplexityPromise;
    expect(perplexityResults).toHaveLength(13);
    expect(perplexityResults.every((r) => r.failed)).toBe(true);
  });
});
