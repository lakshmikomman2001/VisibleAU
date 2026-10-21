import { describe, expect, it } from "vitest";
import { classifyError } from "@/lib/llm/classify-error";
import { EmptyResponseError, SearchToolError } from "@/lib/llm/errors";

describe("classifyError", () => {
  it("a SearchToolError with a KNOWN transient code is search_tool_error, retryable, carrying its real billed cost", () => {
    const c = classifyError(new SearchToolError("Claude web_search failed", "max_uses_exceeded", 0.0042));
    expect(c.errorClass).toBe("search_tool_error");
    expect(c.retryable).toBe(true);
    expect(c.costUsd).toBe(0.0042);
    expect(c.toolErrorCode).toBe("max_uses_exceeded");
  });

  it("a SearchToolError with an UNRECOGNISED code is search_tool_error but NOT retryable (never guess)", () => {
    const c = classifyError(new SearchToolError("ChatGPT web_search failed", "some_new_code_we_never_saw", 0.01));
    expect(c.errorClass).toBe("search_tool_error");
    expect(c.retryable).toBe(false);
  });

  it("a SearchToolError with no code at all is search_tool_error, not retryable", () => {
    const c = classifyError(new SearchToolError("Gemini web_search failed", undefined, 0));
    expect(c.errorClass).toBe("search_tool_error");
    expect(c.retryable).toBe(false);
    expect(c.costUsd).toBe(0);
  });

  it("EmptyResponseError -> empty_response, never retryable, 0 cost", () => {
    const c = classifyError(new EmptyResponseError("chatgpt"));
    expect(c.errorClass).toBe("empty_response");
    expect(c.retryable).toBe(false);
    expect(c.costUsd).toBe(0);
  });

  it("a SyntaxError (malformed JSON body) -> parse_error, never retryable", () => {
    const c = classifyError(new SyntaxError("Unexpected token in JSON"));
    expect(c.errorClass).toBe("parse_error");
    expect(c.retryable).toBe(false);
  });

  it("an AbortError (AbortSignal.timeout firing) -> timeout, retryable", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    const c = classifyError(err);
    expect(c.errorClass).toBe("timeout");
    expect(c.retryable).toBe(true);
  });

  it("a plain 'timed out' message with no special name -> timeout, retryable", () => {
    const c = classifyError(new Error("Request timed out after 30000ms"));
    expect(c.errorClass).toBe("timeout");
    expect(c.retryable).toBe(true);
  });

  it("an error exposing statusCode 429 -> rate_limited, retryable", () => {
    const err = Object.assign(new Error("Too Many Requests"), { statusCode: 429 });
    const c = classifyError(err);
    expect(c.errorClass).toBe("rate_limited");
    expect(c.retryable).toBe(true);
  });

  it("Perplexity's own hand-rolled error message (status embedded in text) -> rate_limited", () => {
    const c = classifyError(new Error("Perplexity API 429: rate limit exceeded"));
    expect(c.errorClass).toBe("rate_limited");
    expect(c.retryable).toBe(true);
  });

  it("an error exposing statusCode 503 -> overloaded, retryable", () => {
    const err = Object.assign(new Error("Service Unavailable"), { statusCode: 503 });
    const c = classifyError(err);
    expect(c.errorClass).toBe("overloaded");
    expect(c.retryable).toBe(true);
  });

  it("an error exposing statusCode 529 (Anthropic's own overload code) -> overloaded, retryable", () => {
    const err = Object.assign(new Error("Overloaded"), { statusCode: 529 });
    const c = classifyError(err);
    expect(c.errorClass).toBe("overloaded");
    expect(c.retryable).toBe(true);
  });

  it("an unrecognisable error -> other, never retryable", () => {
    const c = classifyError(new Error("Something completely unexpected happened"));
    expect(c.errorClass).toBe("other");
    expect(c.retryable).toBe(false);
  });

  it("a thrown non-Error value is still classified, never throws itself", () => {
    const c = classifyError("a bare string throw");
    expect(c.errorClass).toBe("other");
    expect(c.message).toBe("a bare string throw");
  });
});
