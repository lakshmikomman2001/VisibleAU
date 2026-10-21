import { afterEach, describe, expect, it } from "vitest";
import {
  deadlineAwareTimeoutMs,
  extractCitedUrls,
  extractGroundingDomains,
  hasFailedToolResult,
  isWebSearchEnabled,
} from "@/lib/llm/web-search-config";

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
    expect(extractCitedUrls(sources)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
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

// Audit reliability, Part B, item 2: Gemini's google_search grounding
// returns an opaque vertexaisearch.cloud.google.com redirect as `url`,
// with `title` as the one place a real domain can show up instead (see
// lib/llm/web-search-config.ts's own doc comment for the @ai-sdk/google
// source confirming this). These fixtures mirror extractCitedUrls'
// above.
describe("extractGroundingDomains", () => {
  it("extracts a domain-shaped title, lowercased and www-stripped", () => {
    const sources = [
      {
        type: "source",
        sourceType: "url",
        id: "1",
        url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
        title: "WWW.OmegaServices.com.au",
      },
    ];
    expect(extractGroundingDomains(sources)).toEqual(["omegaservices.com.au"]);
  });

  it("ignores a title that's prose, not a domain", () => {
    const sources = [
      {
        type: "source",
        sourceType: "url",
        id: "1",
        url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
        title: "Omega Services - Official Site",
      },
    ];
    expect(extractGroundingDomains(sources)).toEqual([]);
  });

  it("ignores a source with no title at all", () => {
    const sources = [
      {
        type: "source",
        sourceType: "url",
        id: "1",
        url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
      },
    ];
    expect(extractGroundingDomains(sources)).toEqual([]);
  });

  it("ignores non-url sourceType entries even with a domain-shaped title", () => {
    const sources = [{ type: "source", sourceType: "document", title: "example.com" }];
    expect(extractGroundingDomains(sources)).toEqual([]);
  });

  it("dedupes repeated domains", () => {
    const sources = [
      { type: "source", sourceType: "url", id: "1", url: "https://x/1", title: "example.com" },
      { type: "source", sourceType: "url", id: "2", url: "https://x/2", title: "example.com" },
    ];
    expect(extractGroundingDomains(sources)).toEqual(["example.com"]);
  });

  it("returns [] for non-array input", () => {
    expect(extractGroundingDomains(undefined)).toEqual([]);
    expect(extractGroundingDomains(null)).toEqual([]);
  });

  it("never reads the redirect url itself as a domain source", () => {
    const sources = [
      {
        type: "source",
        sourceType: "url",
        id: "1",
        url: "https://omegaservices.com.au/real-page",
        // No title -- even though the URL itself happens to carry the
        // brand's real domain, this function must never fall back to
        // parsing `url` (that's exactly the opaque-redirect case it
        // exists for; trusting url here would silently stop being safe
        // the moment a provider's redirect host changes).
      },
    ];
    expect(extractGroundingDomains(sources)).toEqual([]);
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
