/**
 * S04 part 4 (LLD 8.4.4, as part 1 confirmed): the location each engine's web search is told per reach, and the answer
 * cache per reach. The real adapters run through the installed AI SDK against a canned provider response (no network);
 * the request each one sent is read back.
 * - Local: exactly today's (city, state, "AU" for a confirmed fixed location with a city), and today's cache key.
 * - State: ChatGPT gets the capital as the city, the state's name and the country; Claude the state's name and the
 *   country. Country: the country alone. Worldwide: no user_location at all.
 * - Gemini: none, whatever the reach. Perplexity (S04B part 1, LLD amendment 99): as Claude (its request body is in
 *   tests/unit/llm/perplexity-agent-api.test.ts).
 * - The cache key of a question beyond Local carries its reach and location, so the same words are never replayed from
 *   another reach (or another place); a Local key is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildEngineLocation } from "@/lib/brands/region-label";
import { makeKey } from "@/lib/llm/cache";
import {
  answerCacheScope,
  engineCallReach,
  engineLocationForReach,
} from "@/lib/reach/engine-location";
import { anthropicMessage, anthropicText, cannedFetch } from "../../helpers/canned-llm-responses";

const cache = vi.hoisted(() => ({ scopes: [] as Array<string | undefined> }));
vi.mock("@/lib/llm/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/cache")>();
  return {
    ...actual,
    getCached: vi.fn(async (...args: unknown[]) => {
      cache.scopes.push((args[4] as { scope?: string } | undefined)?.scope);
      return null;
    }),
    setCached: vi.fn().mockResolvedValue(undefined),
  };
});

const BRAND = {
  locationMode: "fixed" as const,
  locationConfirmedAt: new Date("2026-11-01T00:00:00Z"),
  city: "Sydney",
  state: "NSW",
  region: "au" as const,
};
const PROMPT = "Can you recommend managed IT services in NSW?";

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  cache.scopes = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function openaiResponse(): Record<string, unknown> {
  return {
    id: "resp_canned",
    object: "response",
    created_at: 1762500000,
    status: "completed",
    model: "gpt-4.1-mini-2025-04-14",
    output: [
      {
        type: "message",
        id: "msg_canned",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: "NumbaTek IT is one option.", annotations: [] }],
      },
    ],
    usage: {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 20,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 120,
    },
  };
}

type Reach = "local" | "state" | "country" | "global";
type Tool = { type: string; user_location?: Record<string, string> };

async function sent(engine: "chatgpt" | "claude", reach: Reach) {
  const canned = cannedFetch([
    engine === "chatgpt" ? openaiResponse() : anthropicMessage([anthropicText("An answer.")]),
  ]);
  vi.stubGlobal("fetch", canned.fetchStub);
  const impl =
    engine === "chatgpt"
      ? new (await import("@/lib/llm/openai-impl")).OpenAIImpl()
      : new (await import("@/lib/llm/anthropic-impl")).AnthropicImpl();
  await impl.complete({
    engine,
    prompt: PROMPT,
    task: "brand_mention",
    model: engine === "chatgpt" ? "gpt-4.1-mini" : "claude-haiku-4-5",
    cacheMode: "retry",
    ...engineCallReach(reach, engine, BRAND),
  });
  const tools = (canned.requests[0].tools ?? []) as Tool[];
  const search = tools.find((t) => t.type === "web_search" || t.type.startsWith("web_search_"));
  return { search, scope: cache.scopes.at(-1) };
}

describe("each engine's request per reach", () => {
  it("ChatGPT: Local today's; State the capital, the state and the country; Country the country; Worldwide none", async () => {
    expect((await sent("chatgpt", "local")).search?.user_location).toEqual({
      type: "approximate",
      city: "Sydney",
      region: "NSW",
      country: "AU",
    });
    expect((await sent("chatgpt", "state")).search?.user_location).toEqual({
      type: "approximate",
      city: "Sydney",
      region: "New South Wales",
      country: "AU",
    });
    expect((await sent("chatgpt", "country")).search?.user_location).toEqual({
      type: "approximate",
      country: "AU",
    });
    const worldwide = await sent("chatgpt", "global");
    expect(worldwide.search).toBeDefined();
    expect(worldwide.search?.user_location).toBeUndefined();
  });

  it("Claude: Local today's; State the state and the country (no city); Country the country; Worldwide none", async () => {
    expect((await sent("claude", "local")).search?.user_location).toEqual({
      type: "approximate",
      city: "Sydney",
      region: "NSW",
      country: "AU",
    });
    expect((await sent("claude", "state")).search?.user_location).toEqual({
      type: "approximate",
      region: "New South Wales",
      country: "AU",
    });
    expect((await sent("claude", "country")).search?.user_location).toEqual({
      type: "approximate",
      country: "AU",
    });
    expect((await sent("claude", "global")).search?.user_location).toBeUndefined();
  });

  it("Gemini is told no location for any reach, Perplexity Claude's; Local is buildEngineLocation's, unchanged", () => {
    for (const reach of ["state", "country", "global"] as const) {
      expect(engineLocationForReach(reach, "gemini", BRAND)).toBeUndefined();
      // S04B part 1 (LLD amendment 99): Perplexity's Agent API web_search takes a user_location.
      expect(engineLocationForReach(reach, "perplexity", BRAND)).toEqual(
        engineLocationForReach(reach, "claude", BRAND),
      );
    }
    for (const engine of ["chatgpt", "claude", "gemini", "perplexity"])
      expect(engineLocationForReach("local", engine, BRAND)).toEqual(buildEngineLocation(BRAND));
    expect(engineLocationForReach(undefined, "chatgpt", BRAND)).toEqual(buildEngineLocation(BRAND));
    // A brand with no confirmed location: no Local location, as today; State still from its state.
    const unconfirmed = { ...BRAND, locationConfirmedAt: null };
    expect(engineLocationForReach("local", "chatgpt", unconfirmed)).toBeUndefined();
    // No state, or the US stub's empty market: nothing beyond Local.
    expect(engineLocationForReach("state", "chatgpt", { ...BRAND, state: null })).toBeUndefined();
    expect(
      engineLocationForReach("country", "chatgpt", { ...BRAND, region: "us" }),
    ).toBeUndefined();
  });
});

describe("the answer cache per reach", () => {
  it("Local keeps today's key (no scope); each other reach and place has its own", async () => {
    expect((await sent("chatgpt", "local")).scope).toBeUndefined();
    const scopes = new Set<string | undefined>();
    for (const reach of ["state", "country", "global"] as const) {
      for (const engine of ["chatgpt", "claude"] as const) {
        const { scope } = await sent(engine, reach);
        expect(scope).toMatch(new RegExp(`^reach=${reach};`));
        scopes.add(`${engine}:${scope}`);
      }
    }
    expect(scopes.size).toBe(6);
    const local = makeKey(PROMPT, "gpt-4.1-mini", "grounded");
    expect(makeKey(PROMPT, "gpt-4.1-mini", "grounded", undefined)).toBe(local);
    const keys = new Set(
      (["state", "country", "global"] as const).map((r) =>
        makeKey(
          PROMPT,
          "gpt-4.1-mini",
          "grounded",
          answerCacheScope(r, engineLocationForReach(r, "chatgpt", BRAND)),
        ),
      ),
    );
    expect(keys.size).toBe(3);
    expect(keys.has(local)).toBe(false);
    // The same reach told another place is another key.
    expect(answerCacheScope("state", { region: "Victoria", country: "AU" })).not.toBe(
      answerCacheScope("state", { region: "New South Wales", country: "AU" }),
    );
  });
});
