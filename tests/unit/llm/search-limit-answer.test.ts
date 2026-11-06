/**
 * "Mention detection" (6 Nov), part 3 -- a Claude answer isn't thrown away over a 6th search. With maxUses: 5,
 * Anthropic answers a 6th search request with a web_search_tool_result error, error_code max_uses_exceeded,
 * and Claude goes on to write its answer from the 5 searches it did run. That answer used to be recorded as a
 * search_tool_error failure, with no text. The real adapter parses canned responses through the real AI SDK.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchToolError } from "@/lib/llm/errors";
import {
  anthropicCitedText,
  anthropicMessage,
  anthropicSearch,
  anthropicSearchError,
  anthropicText,
  cannedFetch,
} from "../../helpers/canned-llm-responses";

vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

const fiveSearches = [1, 2, 3, 4, 5].flatMap((n) =>
  anthropicSearch(`srvtoolu_${n}`, [`https://site${n}.com.au/`]),
);

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function claude(content: Array<Record<string, unknown>>) {
  vi.stubGlobal("fetch", cannedFetch([anthropicMessage(content, "end_turn", 5)]).fetchStub);
  const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
  return new AnthropicImpl().complete({
    engine: "claude",
    prompt: "Good plumber?",
    task: "brand_mention",
    cacheMode: "fresh",
  });
}

describe("a 6th search over the limit", () => {
  it("with the answer written after it: kept as the answer, its stop reason recorded, its 5 searches billed", async () => {
    const output = await claude([
      anthropicText("I'll search for plumbers near Norwest."),
      ...fiveSearches,
      ...anthropicSearchError("srvtoolu_6", "max_uses_exceeded"),
      anthropicCitedText(
        "Omega Services is a well-reviewed plumber in Norwest.",
        "https://site1.com.au/",
      ),
    ]);

    expect(output.response).toBe(
      "I'll search for plumbers near Norwest.\nOmega Services is a well-reviewed plumber in Norwest.",
    );
    expect(output.stopReason).toBe("end_turn");
    expect(output.citedUrls?.[0]).toBe("https://site1.com.au/");
  });

  it("with no answer text at all: a search_tool_error failure, as before", async () => {
    const err = await claude([
      ...fiveSearches,
      ...anthropicSearchError("srvtoolu_6", "max_uses_exceeded"),
    ]).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SearchToolError);
    expect((err as SearchToolError).toolErrorCode).toBe("max_uses_exceeded");
  });

  it("a search that broke for any other reason still fails the call, even with text after it", async () => {
    const err = await claude([
      ...anthropicSearchError("srvtoolu_1", "unavailable"),
      anthropicText("Based on what I know, Omega Services is a plumber."),
    ]).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SearchToolError);
    expect((err as SearchToolError).toolErrorCode).toBe("unavailable");
  });
});
