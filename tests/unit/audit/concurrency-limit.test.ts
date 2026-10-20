import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pLimit } from "@/lib/audit/concurrency-limit";

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
