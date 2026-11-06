import { afterEach, describe, expect, it } from "vitest";
import {
  anthropicWebSearchCount,
  deadlineAwareTimeoutMs,
  ENGINE_CALL_TIMEOUT_MS,
  estimatedSearchFeeUsd,
  anthropicAnswerSources,
  extractCitedUrls,
  extractToolErrorCode,
  failedToolErrorCodes,
  geminiAnswerSources,
  GEMINI_GROUNDED_PROMPT_FEE_UPPER_BOUND_USD,
  geminiGroundingFeeUsd,
  hasFailedToolResult,
  isGoogleGroundingRedirect,
  isWebSearchEnabled,
  onlySearchLimitReached,
  openaiWebSearchCallCount,
  webSearchFeeUsd,
} from "@/lib/llm/web-search-config";

// "Claude timeouts: per-engine call timeouts" (23 Oct) -- replaces 4
// separate, independently-hardcoded 30s constants (one per *-impl.ts)
// with this one named, per-engine source of truth.
describe("ENGINE_CALL_TIMEOUT_MS", () => {
  it("Claude gets 75s -- diag-0090's only engine with real timeout failures", () => {
    expect(ENGINE_CALL_TIMEOUT_MS.claude).toBe(75_000);
  });

  it("chatgpt, gemini and perplexity keep the original 30s -- no evidence justifies changing them", () => {
    expect(ENGINE_CALL_TIMEOUT_MS.chatgpt).toBe(30_000);
    expect(ENGINE_CALL_TIMEOUT_MS.gemini).toBe(30_000);
    expect(ENGINE_CALL_TIMEOUT_MS.perplexity).toBe(30_000);
  });

  it("has an entry for every Engine union member -- *-impl.ts would get `undefined` as a base timeout otherwise", () => {
    const engines: Array<keyof typeof ENGINE_CALL_TIMEOUT_MS> = [
      "chatgpt",
      "claude",
      "gemini",
      "perplexity",
    ];
    for (const engine of engines) {
      expect(typeof ENGINE_CALL_TIMEOUT_MS[engine]).toBe("number");
      expect(ENGINE_CALL_TIMEOUT_MS[engine]).toBeGreaterThan(0);
    }
  });
});

describe("isWebSearchEnabled", () => {
  afterEach(() => {
    delete process.env.ENGINE_WEB_SEARCH_CHATGPT;
    delete process.env.ENGINE_WEB_SEARCH_CLAUDE;
    delete process.env.ENGINE_WEB_SEARCH_GEMINI;
  });

  it("defaults to true (ON) when the env var is unset", () => {
    expect(isWebSearchEnabled("chatgpt")).toBe(true);
    expect(isWebSearchEnabled("claude")).toBe(true);
    expect(isWebSearchEnabled("gemini")).toBe(true);
  });

  it("defaults to true when the env var is an empty string", () => {
    process.env.ENGINE_WEB_SEARCH_CHATGPT = "";
    expect(isWebSearchEnabled("chatgpt")).toBe(true);
  });

  it("is off for 'off', '0', and 'false' (case-insensitive)", () => {
    process.env.ENGINE_WEB_SEARCH_CHATGPT = "off";
    expect(isWebSearchEnabled("chatgpt")).toBe(false);
    process.env.ENGINE_WEB_SEARCH_CLAUDE = "OFF";
    expect(isWebSearchEnabled("claude")).toBe(false);
    process.env.ENGINE_WEB_SEARCH_GEMINI = "0";
    expect(isWebSearchEnabled("gemini")).toBe(false);
  });

  it("is on for 'on' or any other truthy-looking value", () => {
    process.env.ENGINE_WEB_SEARCH_CHATGPT = "on";
    expect(isWebSearchEnabled("chatgpt")).toBe(true);
  });

  it("checks each engine independently", () => {
    process.env.ENGINE_WEB_SEARCH_CHATGPT = "off";
    expect(isWebSearchEnabled("chatgpt")).toBe(false);
    expect(isWebSearchEnabled("claude")).toBe(true);
    expect(isWebSearchEnabled("perplexity")).toBe(true);
  });
});

describe("extractCitedUrls", () => {
  it("extracts urls from url-type sources", () => {
    const sources = [
      { type: "source", sourceType: "url", id: "1", url: "https://example.com/a" },
      { type: "source", sourceType: "url", id: "2", url: "https://example.com/b", title: "B" },
    ];
    expect(extractCitedUrls(sources)).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("ignores non-url sourceType entries", () => {
    const sources = [
      { type: "source", sourceType: "document", id: "1" },
      { type: "source", sourceType: "url", id: "2", url: "https://example.com/b" },
    ];
    expect(extractCitedUrls(sources)).toEqual(["https://example.com/b"]);
  });

  it("returns [] (not undefined) for a valid but empty array -- 'searched, found nothing'", () => {
    expect(extractCitedUrls([])).toEqual([]);
  });

  it("returns undefined for undefined/non-array input -- 'never searched at all'", () => {
    expect(extractCitedUrls(undefined)).toBeUndefined();
    expect(extractCitedUrls(null)).toBeUndefined();
    expect(extractCitedUrls("not an array")).toBeUndefined();
  });

  it("returns [] when no entry has a valid url", () => {
    expect(extractCitedUrls([{ type: "source", sourceType: "document" }])).toEqual([]);
  });
});

// Audit reliability, Part B, item 2 / "Mention detection" (6 Nov), part 5: Gemini's google_search
// grounding returns an opaque vertexaisearch.cloud.google.com redirect as `url`, with `title` as the one
// place the real site shows up (@ai-sdk/google's extractSources). Each link now travels with that site.
describe("geminiAnswerSources", () => {
  const REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";

  it("pairs each grounding link with its domain-shaped title, lowercased and www-stripped", () => {
    const sources = [
      {
        type: "source",
        sourceType: "url",
        id: "1",
        url: REDIRECT,
        title: "WWW.OmegaServices.com.au",
      },
    ];
    expect(geminiAnswerSources(sources)).toEqual([
      { url: REDIRECT, domain: "omegaservices.com.au" },
    ]);
  });

  it("keeps a link whose title is prose, or missing, as a plain URL -- unresolvable, never guessed", () => {
    const sources = [
      {
        type: "source",
        sourceType: "url",
        id: "1",
        url: REDIRECT,
        title: "Omega Services - Official Site",
      },
      { type: "source", sourceType: "url", id: "2", url: `${REDIRECT}2` },
    ];
    expect(geminiAnswerSources(sources)).toEqual([REDIRECT, `${REDIRECT}2`]);
  });

  it("never reads a domain out of the url itself, only the title", () => {
    const sources = [
      { type: "source", sourceType: "url", id: "1", url: "https://omegaservices.com.au/real-page" },
    ];
    expect(geminiAnswerSources(sources)).toEqual(["https://omegaservices.com.au/real-page"]);
  });

  it("ignores non-url sources and non-array input", () => {
    expect(
      geminiAnswerSources([{ type: "source", sourceType: "document", title: "example.com" }]),
    ).toEqual([]);
    expect(geminiAnswerSources(undefined)).toEqual([]);
    expect(geminiAnswerSources(null)).toEqual([]);
  });
});

// "Mention detection" (6 Nov), part 5: @ai-sdk/anthropic gives a source for every search result
// (providerMetadata.anthropic.pageAge) and for every citation in the text (providerMetadata.anthropic.
// citedText). Only the cited ones are the answer's sources; the rest were seen in search.
describe("anthropicAnswerSources", () => {
  const searchResult = (url: string) => ({
    type: "source",
    sourceType: "url",
    id: url,
    url,
    title: "A page",
    providerMetadata: { anthropic: { pageAge: null } },
  });
  const citation = (url: string) => ({
    type: "source",
    sourceType: "url",
    id: `${url}#cite`,
    url,
    title: "A page",
    providerMetadata: { anthropic: { citedText: "quoted words", encryptedIndex: "e" } },
  });

  it("lists the cited pages first, then the search results the answer never cited as cited: false", () => {
    const sources = [
      searchResult("https://omegaservices.com.au/"),
      searchResult("https://hipages.com.au/plumbers"),
      citation("https://hipages.com.au/plumbers"),
    ];
    expect(anthropicAnswerSources(sources)).toEqual([
      "https://hipages.com.au/plumbers",
      { url: "https://omegaservices.com.au/", cited: false },
    ]);
  });

  it("a page cited twice is listed once", () => {
    const sources = [citation("https://a.com.au/"), citation("https://a.com.au/")];
    expect(anthropicAnswerSources(sources)).toEqual(["https://a.com.au/"]);
  });

  it("no search ran: no sources", () => {
    expect(anthropicAnswerSources([])).toEqual([]);
    expect(anthropicAnswerSources(undefined)).toEqual([]);
  });
});

describe("isGoogleGroundingRedirect", () => {
  it("is true only for Google's grounding redirect host", () => {
    expect(
      isGoogleGroundingRedirect("https://vertexaisearch.cloud.google.com/grounding-api-redirect/x"),
    ).toBe(true);
    expect(isGoogleGroundingRedirect("https://hipages.com.au/x")).toBe(false);
    expect(isGoogleGroundingRedirect("not a url")).toBe(false);
  });
});

// Audit reliability, Part C, item 1: the sample audit's overall
// deadline must actually cut a slow call short, not just stop a
// retry from starting -- this is the arithmetic that bounds each
// engine impl's own abort signal by whichever is sooner.
describe("deadlineAwareTimeoutMs", () => {
  it("returns the base timeout unchanged when there's no deadline", () => {
    expect(deadlineAwareTimeoutMs(30_000, undefined)).toBe(30_000);
  });

  it("returns the base timeout when there's MORE time left than the base timeout needs", () => {
    const deadlineAt = Date.now() + 120_000; // 2 minutes away
    expect(deadlineAwareTimeoutMs(30_000, deadlineAt)).toBe(30_000);
  });

  it("returns the shorter, remaining-time figure when the deadline is sooner than the base timeout", () => {
    const deadlineAt = Date.now() + 5_000;
    const result = deadlineAwareTimeoutMs(30_000, deadlineAt);
    expect(result).toBeLessThanOrEqual(5_000);
    expect(result).toBeGreaterThan(4_000); // allow a little test-execution slack
  });

  it("floors at 0 -- never a negative timeout -- when the deadline has already passed", () => {
    const deadlineAt = Date.now() - 5_000;
    expect(deadlineAwareTimeoutMs(30_000, deadlineAt)).toBe(0);
  });
});

describe("hasFailedToolResult", () => {
  it("detects a tool-result part with isError: true", () => {
    const content = [
      { type: "text", text: "hello" },
      { type: "tool-result", toolCallId: "1", toolName: "web_search", isError: true },
    ];
    expect(hasFailedToolResult(content)).toBe(true);
  });

  it("returns false when every tool-result succeeded", () => {
    const content = [
      { type: "text", text: "hello" },
      { type: "tool-result", toolCallId: "1", toolName: "web_search", isError: false },
    ];
    expect(hasFailedToolResult(content)).toBe(false);
  });

  it("returns false for non-array input", () => {
    expect(hasFailedToolResult(undefined)).toBe(false);
    expect(hasFailedToolResult(null)).toBe(false);
  });

  it("returns false when there are no tool-result parts at all", () => {
    expect(hasFailedToolResult([{ type: "text", text: "hello" }])).toBe(false);
  });
});

// "Record costs from what each provider actually reports" (6 Nov), item 2.
describe("search fees from the counts a response reports", () => {
  const searchCall = (id: string, providerExecuted = true) => ({
    type: "tool-call",
    toolCallId: id,
    toolName: "web_search",
    input: "{}",
    providerExecuted,
  });

  it("$10 per 1,000 searches for ChatGPT and Claude: 0, 1 and 3 searches", () => {
    for (const engine of ["chatgpt", "claude"] as const) {
      expect(webSearchFeeUsd(engine, 0), engine).toBe(0);
      expect(webSearchFeeUsd(engine, 1), engine).toBeCloseTo(0.01, 12);
      expect(webSearchFeeUsd(engine, 3), engine).toBeCloseTo(0.03, 12);
    }
  });

  it("Gemini's grounded-prompt fee is the upper bound when grounded, none when not", () => {
    expect(GEMINI_GROUNDED_PROMPT_FEE_UPPER_BOUND_USD).toBe(0.035);
    expect(geminiGroundingFeeUsd(true)).toBe(0.035);
    expect(geminiGroundingFeeUsd(false)).toBe(0);
  });

  it("counts only the provider-run web_search calls in an OpenAI answer", () => {
    const content = [
      searchCall("ws_1"),
      { type: "tool-result", toolCallId: "ws_1", toolName: "web_search", result: {} },
      searchCall("ws_2"),
      searchCall("local", false),
      {
        type: "tool-call",
        toolCallId: "x",
        toolName: "file_search",
        input: "{}",
        providerExecuted: true,
      },
      { type: "text", text: "answer" },
    ];
    expect(openaiWebSearchCallCount(content)).toBe(2);
    expect(openaiWebSearchCallCount([{ type: "text", text: "answer" }])).toBe(0);
    expect(openaiWebSearchCallCount(undefined)).toBe(0);
  });

  it("reads Claude's usage.server_tool_use.web_search_requests, null as none", () => {
    const meta = (serverToolUse: unknown) => ({
      anthropic: { usage: { input_tokens: 10, output_tokens: 5, server_tool_use: serverToolUse } },
    });
    expect(
      anthropicWebSearchCount(meta({ web_search_requests: 3, web_fetch_requests: 0 }), []),
    ).toBe(3);
    expect(anthropicWebSearchCount(meta({ web_search_requests: 0 }), [searchCall("s1")])).toBe(0);
    expect(anthropicWebSearchCount(meta(null), [searchCall("s1")])).toBe(0);
  });

  it("falls back to Claude's provider-run web_search calls only when the usage doesn't say", () => {
    const content = [searchCall("s1"), searchCall("s2"), { type: "text", text: "answer" }];
    expect(anthropicWebSearchCount({ anthropic: { usage: { input_tokens: 10 } } }, content)).toBe(
      2,
    );
    expect(anthropicWebSearchCount(undefined, content)).toBe(2);
    expect(
      anthropicWebSearchCount({ anthropic: { usage: { server_tool_use: undefined } } }, content),
    ).toBe(2);
    expect(
      anthropicWebSearchCount(
        { anthropic: { usage: { server_tool_use: { web_search_requests: "3" } } } },
        content,
      ),
    ).toBe(2);
    expect(anthropicWebSearchCount(undefined, undefined)).toBe(0);
  });

  it("the pre-flight budget estimate still counts one search per grounded call", () => {
    expect(estimatedSearchFeeUsd("chatgpt", true)).toBeCloseTo(0.01, 12);
    expect(estimatedSearchFeeUsd("claude", true)).toBeCloseTo(0.01, 12);
    expect(estimatedSearchFeeUsd("gemini", true)).toBe(0.035);
    for (const engine of ["chatgpt", "claude", "gemini"] as const) {
      expect(estimatedSearchFeeUsd(engine, false), engine).toBe(0);
    }
  });
});

// "Mention detection" (6 Nov), part 3: a search over Claude's limit (max_uses_exceeded) isn't a broken search.
describe("failedToolErrorCodes / onlySearchLimitReached", () => {
  const failed = (code?: string) => ({
    type: "tool-result",
    toolCallId: "t",
    toolName: "web_search",
    isError: true,
    result: code ? { type: "web_search_tool_result_error", errorCode: code } : {},
  });

  it("lists every failed result's code, undefined where it has none", () => {
    expect(
      failedToolErrorCodes([failed("max_uses_exceeded"), { type: "text", text: "x" }, failed()]),
    ).toEqual(["max_uses_exceeded", undefined]);
    expect(failedToolErrorCodes(undefined)).toEqual([]);
  });

  it("is true only when every failed search was over the limit", () => {
    expect(onlySearchLimitReached([failed("max_uses_exceeded")])).toBe(true);
    expect(onlySearchLimitReached([failed("max_uses_exceeded"), failed("unavailable")])).toBe(
      false,
    );
    expect(onlySearchLimitReached([failed()])).toBe(false);
    expect(onlySearchLimitReached([])).toBe(false);
  });
});

// "Mention detection" (6 Nov), part 3: ai@6 turns @ai-sdk/anthropic's errored tool result into a "tool-error"
// part. The check used to look only for { type: "tool-result", isError: true }, so it never fired for real.
describe("hasFailedToolResult -- the shape the AI SDK really produces", () => {
  const toolError = {
    type: "tool-error",
    toolCallId: "srvtoolu_6",
    toolName: "web_search",
    error: { type: "web_search_tool_result_error", errorCode: "max_uses_exceeded" },
    providerExecuted: true,
  };

  it("a tool-error part is a failed search, and its code is read", () => {
    expect(hasFailedToolResult([{ type: "text", text: "x" }, toolError])).toBe(true);
    expect(extractToolErrorCode([toolError])).toBe("max_uses_exceeded");
  });
});
