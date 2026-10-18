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
 *
 * Task #44: Bondi was re-audited the same day migration 0038 shipped --
 * within the 48h TTL, llm_response_cache still holds Perplexity
 * responses for the exact same prompts written BEFORE citedUrls
 * existed. getCached now treats a NULL citedUrls as a miss, but ONLY
 * for engines that are supposed to supply structured citations
 * (ENGINE_SUPPLIES_STRUCTURED_CITATIONS, lib/llm/interface.ts) --
 * otherwise task #43's fix would look broken on a re-audit inside the
 * TTL window. For the other three engines, a NULL citedUrls is the
 * normal, permanent state and must still be a genuine hit. See
 * docs/ops/post-launch-db-hardening.md section 44.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockState, mockDbObj } = vi.hoisted(() => {
  const state = {
    selectResult: [] as Record<string, unknown>[],
    selectThrows: false,
    insertThrows: false,
    // Vunnara Build 1, Part G.4: captures each insert's values() call so
    // tests can inspect the cache key / expiresAt actually written.
    lastInsertValues: null as Record<string, unknown> | null,
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
      values: (v: Record<string, unknown>) => {
        state.lastInsertValues = v;
        return {
          onConflictDoUpdate: () => {
            if (state.insertThrows) throw new Error('column "cited_urls" does not exist');
            return Promise.resolve();
          },
        };
      },
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

    await setCached(
      "prompt text",
      "sonar-pro",
      {
        response: "answer",
        tokensUsed: 100,
        costEstimateUsd: 0.01,
        citedUrls: ["https://hipages.com.au/connect/plumber"],
      },
      "grounded",
    );

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

    const hit = await getCached("prompt text", "sonar-pro", "perplexity", "grounded");

    expect(hit?.citedUrls).toEqual(["https://hipages.com.au/connect/plumber"]);
  });

  // Task #46 Phase 2, Part C: isCacheHit is the new explicit, reliable
  // signal (replacing the old costEstimateUsd === 0 inference) -- a
  // genuine getCached() hit must always set it true.
  it("getCached sets isCacheHit: true on a genuine hit", async () => {
    const { getCached } = await import("@/lib/llm/cache");

    mockState.selectResult = [
      { id: "row-cache-hit", response: "answer", tokensUsed: 50, model: "gpt-4.1-mini", hitCount: 1, citedUrls: null },
    ];

    const hit = await getCached("some prompt", "gpt-4.1-mini", "chatgpt", "memory_only");
    expect(hit?.isCacheHit).toBe(true);
  });

  it("an engine without structured sources (citedUrls omitted from the output) caches and restores fine with no citedUrls", async () => {
    const { getCached, setCached } = await import("@/lib/llm/cache");

    await setCached(
      "prompt text",
      "gpt-4.1-mini",
      {
        response: "answer",
        tokensUsed: 80,
        costEstimateUsd: 0.005,
      },
      "memory_only",
    );

    mockState.selectResult = [
      { id: "row-3", response: "answer", tokensUsed: 80, model: "gpt-4.1-mini", hitCount: 1, citedUrls: null },
    ];

    const hit = await getCached("prompt text", "gpt-4.1-mini", "chatgpt", "memory_only");
    expect(hit?.citedUrls).toBeUndefined();
    expect(hit?.response).toBe("answer"); // still a genuine hit, not a miss
  });
});

describe("llm/cache -- stale pre-migration-0038 entries are a miss ONLY for engines that supply structured citations", () => {
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

  it("Perplexity (supplies citations) with a NULL citedUrls cached row -> miss, not a stale hit", async () => {
    const { getCached } = await import("@/lib/llm/cache");

    mockState.selectResult = [
      {
        id: "row-4",
        response: "stale answer from before migration 0038",
        tokensUsed: 90,
        model: "sonar-pro",
        hitCount: 2,
        citedUrls: null, // written before citedUrls existed
      },
    ];

    const hit = await getCached("Best plumber in Sydney?", "sonar-pro", "perplexity", "grounded");

    expect(hit).toBeNull();
  });

  it("Perplexity with a real citedUrls array cached row -> genuine hit", async () => {
    const { getCached } = await import("@/lib/llm/cache");

    mockState.selectResult = [
      {
        id: "row-5",
        response: "answer with sources",
        tokensUsed: 90,
        model: "sonar-pro",
        hitCount: 2,
        citedUrls: ["https://hipages.com.au/connect/plumber"],
      },
    ];

    const hit = await getCached("Best plumber in Sydney?", "sonar-pro", "perplexity", "grounded");

    expect(hit).not.toBeNull();
    expect(hit?.citedUrls).toEqual(["https://hipages.com.au/connect/plumber"]);
  });

  it("Perplexity with an empty citedUrls array ([], a real call that found none) -> still a genuine hit, not forced to miss", async () => {
    const { getCached } = await import("@/lib/llm/cache");

    mockState.selectResult = [
      {
        id: "row-6",
        response: "answer with no sources found",
        tokensUsed: 60,
        model: "sonar-pro",
        hitCount: 1,
        citedUrls: [],
      },
    ];

    const hit = await getCached("Obscure query", "sonar-pro", "perplexity", "grounded");

    expect(hit).not.toBeNull();
    expect(hit?.citedUrls).toEqual([]);
  });

  it.each(["chatgpt", "claude", "gemini"] as const)(
    "%s (never supplies citations) with a NULL citedUrls cached row -> still a genuine hit, not forced to miss",
    async (engine) => {
      const { getCached } = await import("@/lib/llm/cache");

      mockState.selectResult = [
        {
          id: `row-${engine}`,
          response: "ordinary cached answer",
          tokensUsed: 70,
          model: "model-id",
          hitCount: 1,
          citedUrls: null,
        },
      ];

      const hit = await getCached("Some prompt", "model-id", engine, "memory_only");

      expect(hit).not.toBeNull();
      expect(hit?.response).toBe("ordinary cached answer");
    },
  );
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

    await expect(getCached("prompt", "sonar-pro", "perplexity", "grounded")).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[llm-cache] getCached failed (treating as cache miss)",
      expect.objectContaining({ model: "sonar-pro", engine: "perplexity" }),
    );
  });

  it("setCached resolves (doesn't throw) instead of breaking the caller when the underlying insert fails", async () => {
    mockState.insertThrows = true;
    const { setCached } = await import("@/lib/llm/cache");

    await expect(
      setCached("prompt", "sonar-pro", { response: "x", tokensUsed: 1, costEstimateUsd: 0 }, "grounded"),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "[llm-cache] setCached failed (response not cached, call result still returned)",
      expect.objectContaining({ model: "sonar-pro" }),
    );
  });
});

// Vunnara Build 1, Part G.4: the cache key now includes grounding mode
// (+ methodology version), and a grounded answer gets a shorter TTL.
describe("llm/cache -- grounding mode changes the cache key and TTL (Part G.4)", () => {
  beforeEach(() => {
    mockState.selectResult = [];
    mockState.selectThrows = false;
    mockState.insertThrows = false;
    mockState.lastInsertValues = null;
  });

  it("grounded and memory_only for the identical prompt+model never collide on the same cache key", async () => {
    const { setCached } = await import("@/lib/llm/cache");

    await setCached(
      "same prompt",
      "gpt-4.1-mini",
      { response: "grounded answer", tokensUsed: 10, costEstimateUsd: 0.01 },
      "grounded",
    );
    const groundedKey = mockState.lastInsertValues?.cacheKey;

    await setCached(
      "same prompt",
      "gpt-4.1-mini",
      { response: "memory-only answer", tokensUsed: 10, costEstimateUsd: 0.01 },
      "memory_only",
    );
    const memoryOnlyKey = mockState.lastInsertValues?.cacheKey;

    expect(groundedKey).not.toBe(memoryOnlyKey);
  });

  it("a grounded answer gets a 24h TTL, shorter than memory-only's 48h", async () => {
    const { setCached } = await import("@/lib/llm/cache");
    const before = Date.now();

    await setCached(
      "p",
      "m",
      { response: "r", tokensUsed: 1, costEstimateUsd: 0 },
      "grounded",
    );
    const groundedExpiry = mockState.lastInsertValues?.expiresAt as Date;

    await setCached(
      "p",
      "m",
      { response: "r", tokensUsed: 1, costEstimateUsd: 0 },
      "memory_only",
    );
    const memoryOnlyExpiry = mockState.lastInsertValues?.expiresAt as Date;

    const groundedHours = (groundedExpiry.getTime() - before) / 3600_000;
    const memoryOnlyHours = (memoryOnlyExpiry.getTime() - before) / 3600_000;

    expect(groundedHours).toBeGreaterThan(23.9);
    expect(groundedHours).toBeLessThan(24.1);
    expect(memoryOnlyHours).toBeGreaterThan(47.9);
    expect(memoryOnlyHours).toBeLessThan(48.1);
  });
});
