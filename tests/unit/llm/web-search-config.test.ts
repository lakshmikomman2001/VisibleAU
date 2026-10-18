import { afterEach, describe, expect, it } from "vitest";
import { extractCitedUrls, hasFailedToolResult, isWebSearchEnabled } from "@/lib/llm/web-search-config";

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
