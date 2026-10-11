/**
 * Task #43: llm_response_cache now persists citedUrls (migration 0038)
 * so a cache hit on a replay within the 48h TTL still carries a
 * provider's structured sources -- without this, a cached Perplexity
 * response would silently drop its real sources on every replay.
 * getCached/setCached are also hardened to degrade gracefully (cache
 * miss / response not cached, logged) on any failure -- including the
 * new column not existing yet wherever this runs, before migration 0038
 * is applied -- instead of breaking the LLM call that invoked them.
 * Previously only google-impl.ts guarded its own getCached() call;
 * openai-impl.ts, anthropic-impl.ts, perplexity-impl.ts all awaited it
 * unguarded. See docs/ops/post-launch-db-hardening.md section 43.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockState, mockDbObj } = vi.hoisted(() => {
  const state = {
    selectResult: [] as Record<string, unknown>[],
    selectThrows: false,
    insertThrows: false,
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => {
          if (state.selectThrows) throw new Error('column "cited_urls" does not exist');
          return Promise.resolve(state.selectResult);
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ execute: () => Promise.resolve() }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => {
          if (state.insertThrows) throw new Error('column "cited_urls" does not exist');
          return Promise.resolve();
        },
      }),
    }),
  };
  return { mockState: state, mockDbObj: db };
});

vi.mock("@/db/client", () => ({ db: mockDbObj }));
vi.mock("@/db/schema", () => ({
  llmResponseCache: {
    id: "id",
    cacheKey: "cache_key",
    prompt: "prompt",
    model: "model",
    response: "response",
    tokensUsed: "tokens_used",
    costEstimateUsd: "cost_estimate_usd",
    citedUrls: "cited_urls",
    hitCount: "hit_count",
    expiresAt: "expires_at",
  },
}));

describe("llm/cache -- citedUrls persist across a cache hit", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockState.selectResult = [];
    mockState.selectThrows = false;
    mockState.insertThrows = false;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("setCached persists citedUrls, getCached restores them on a hit", async () => {
    const { getCached, setCached } = await import("@/lib/llm/cache");

    await setCached("prompt text", "sonar-pro", {
      response: "answer",
      tokensUsed: 100,
      costEstimateUsd: 0.01,
      citedUrls: ["https://hipages.com.au/connect/plumber"],
    });

    mockState.selectResult = [
      {
        id: "row-1",
        response: "answer",
        tokensUsed: 100,
        model: "sonar-pro",
        hitCount: 1,
        citedUrls: ["https://hipages.com.au/connect/plumber"],
      },
    ];

    const hit = await getCached("prompt text", "sonar-pro");

    expect(hit?.citedUrls).toEqual(["https://hipages.com.au/connect/plumber"]);
  });

  it("getCached returns undefined citedUrls (not a crash) for a pre-existing cached row with no citedUrls", async () => {
    const { getCached } = await import("@/lib/llm/cache");

    mockState.selectResult = [
      { id: "row-2", response: "answer", tokensUsed: 50, model: "gpt-4.1-mini", hitCount: 3, citedUrls: null },
    ];

    const hit = await getCached("prompt text", "gpt-4.1-mini");

    expect(hit?.citedUrls).toBeUndefined();
    expect(hit?.response).toBe("answer");
  });

  it("an engine without structured sources (citedUrls omitted from the output) caches and restores fine with no citedUrls", async () => {
    const { getCached, setCached } = await import("@/lib/llm/cache");

    await setCached("prompt text", "gpt-4.1-mini", {
      response: "answer",
      tokensUsed: 80,
      costEstimateUsd: 0.005,
    });

    mockState.selectResult = [
      { id: "row-3", response: "answer", tokensUsed: 80, model: "gpt-4.1-mini", hitCount: 1, citedUrls: null },
    ];

    const hit = await getCached("prompt text", "gpt-4.1-mini");
    expect(hit?.citedUrls).toBeUndefined();
  });
});

describe("llm/cache -- non-fatal on failure (e.g. cited_urls column missing before migration 0038 applies)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockState.selectResult = [];
    mockState.selectThrows = false;
    mockState.insertThrows = false;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("getCached returns null (cache miss) instead of throwing when the underlying query fails", async () => {
    mockState.selectThrows = true;
    const { getCached } = await import("@/lib/llm/cache");

    await expect(getCached("prompt", "sonar-pro")).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[llm-cache] getCached failed (treating as cache miss)",
      expect.objectContaining({ model: "sonar-pro" }),
    );
  });

  it("setCached resolves (doesn't throw) instead of breaking the caller when the underlying insert fails", async () => {
    mockState.insertThrows = true;
    const { setCached } = await import("@/lib/llm/cache");

    await expect(
      setCached("prompt", "sonar-pro", { response: "x", tokensUsed: 1, costEstimateUsd: 0 }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "[llm-cache] setCached failed (response not cached, call result still returned)",
      expect.objectContaining({ model: "sonar-pro" }),
    );
  });
});
