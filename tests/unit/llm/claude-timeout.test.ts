/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 4 -- a slow Claude call fails under our control, as a timeout
 * with its latency, before the platform would stop the function: Claude's per-call timeout (75 s,
 * lib/llm/web-search-config.ts) and its one retry fit inside the Inngest step's budget (290 s,
 * lib/llm/step-budget.ts), which fits inside the function's maxDuration (vercel.json: 300 s for
 * /api/webhooks/inngest, Hobby's maximum with Fluid compute). And the call's cost is unknown -- the provider may
 * have billed the search or the tokens it wrote before our abort -- never $0.
 *
 * The real adapter runs through the installed @ai-sdk/anthropic against a provider that never answers; time is
 * faked, so the 75 s timeouts and the 300 s platform limit run in an instant.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeEngineFailure } from "@/lib/audit/engine-failure";
import { AnthropicImpl } from "@/lib/llm/anthropic-impl";
import { INNGEST_STEP_BUDGET_MS, VERCEL_FUNCTION_MAX_DURATION_MS } from "@/lib/llm/step-budget";
import { ENGINE_CALL_TIMEOUT_MS } from "@/lib/llm/web-search-config";
import { callWithRetry } from "@/lib/llm/with-retry";

vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

/** vercel.json's maxDuration for the route that runs every Inngest step, in ms. */
function inngestRouteMaxDurationMs(): number {
  const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
    functions: Record<string, { maxDuration?: number }>;
  };
  const seconds = config.functions["app/api/webhooks/inngest/route.ts"]?.maxDuration;
  if (seconds === undefined)
    throw new Error("vercel.json sets no maxDuration for the Inngest route");
  return seconds * 1000;
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("a slow Claude call times out under our control, before the platform limit", () => {
  it("the limits nest: 2 x 75 s + backoff < the 290 s step budget < the 300 s maxDuration", () => {
    const worstCase = 2 * ENGINE_CALL_TIMEOUT_MS.claude + 1_000;
    expect(ENGINE_CALL_TIMEOUT_MS.claude).toBe(75_000);
    expect(worstCase).toBeLessThan(INNGEST_STEP_BUDGET_MS);
    expect(INNGEST_STEP_BUDGET_MS).toBeLessThan(VERCEL_FUNCTION_MAX_DURATION_MS);
    expect(inngestRouteMaxDurationMs()).toBe(VERCEL_FUNCTION_MAX_DURATION_MS);
  });

  it("a provider that never answers: our timeout fires, a timeout failure with its latency, and an unknown cost", async () => {
    // Every request to Anthropic waits until its abort signal fires -- like a call still searching.
    const requests: Array<{ aborted: boolean }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            const request = { aborted: false };
            requests.push(request);
            init?.signal?.addEventListener("abort", () => {
              request.aborted = true;
              reject(init.signal?.reason);
            });
          }),
      ),
    );
    // AbortSignal.timeout runs on Node's own timer, which fake time doesn't drive: give it one that does.
    const timeouts: number[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      timeouts.push(ms);
      const controller = new AbortController();
      setTimeout(
        () =>
          controller.abort(
            new DOMException("The operation was aborted due to timeout", "TimeoutError"),
          ),
        ms,
      );
      return controller.signal;
    });

    const platformLimitMs = inngestRouteMaxDurationMs();
    const startedAt = Date.now();
    let platformStoppedTheFunction = false;
    setTimeout(() => {
      platformStoppedTheFunction = true;
    }, platformLimitMs);

    // As inngest/functions/run-audit.ts's call step does: one call, its deadline the step's budget.
    const deadlineAt = Date.now() + INNGEST_STEP_BUDGET_MS;
    let settledAt: number | null = null;
    const pending = callWithRetry(
      () =>
        new AnthropicImpl().complete({
          engine: "claude",
          prompt: "Good plumber in Norwest?",
          task: "brand_mention",
          model: "claude-sonnet-4-6",
          cacheMode: "fresh",
          deadlineAt,
        }),
      { deadlineAt },
    ).then((result) => {
      settledAt = Date.now();
      return result;
    });

    await vi.advanceTimersByTimeAsync(platformLimitMs);
    const result = await pending;

    // Our timeout fired on both attempts, before the platform limit.
    expect(timeouts).toEqual([75_000, 75_000]);
    expect(requests.map((r) => r.aborted)).toEqual([true, true]);
    expect(settledAt).not.toBeNull();
    expect((settledAt ?? Number.POSITIVE_INFINITY) - startedAt).toBeLessThan(platformLimitMs);
    expect(platformStoppedTheFunction).toBe(true); // ...the simulated limit came later

    expect(result.status).toBe("failure");
    if (result.status !== "failure") return;
    expect(result.errorClass).toBe("timeout");
    expect(result.attempts).toBe(2);
    expect(result.latencyMs).toBeGreaterThanOrEqual(150_500);
    expect(result.latencyMs).toBeLessThanOrEqual(151_000);
    expect(result.latencyMs).toBeLessThan(INNGEST_STEP_BUDGET_MS);
    // Unknown, never $0: the provider may have billed what it did before the abort.
    expect(result.costUsd).toBeNull();
    expect(
      describeEngineFailure({ errorClass: result.errorClass, message: result.errorMessage }).key,
    ).toBe("timeout");
  });
});
