/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 1 -- every answer's output limit is 8,192 tokens
 * (lib/llm/output-limit.ts). ai@6 reads only maxOutputTokens, so the adapters' `maxTokens: 800` never reached
 * ChatGPT or Claude (Claude got the model's own 64,000 or 128,000); Perplexity's own fetch sent 800. Each real
 * adapter is run through the installed AI SDK against a canned provider response (no network), and the
 * request it sent is read back. An answer that reaches the limit is still kept and flagged as truncated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANSWER_MAX_OUTPUT_TOKENS } from "@/lib/llm/output-limit";
import { anthropicMessage, anthropicText, cannedFetch } from "../../helpers/canned-llm-responses";

vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const PROMPT = "Good plumber in Norwest?";
const ANSWER = "Omega Services is a plumber in Norwest.";

/** An OpenAI Responses API answer; `cutOff` is one that stopped at max_output_tokens. */
function openaiResponse(cutOff = false): Record<string, unknown> {
  return {
    id: "resp_canned",
    object: "response",
    created_at: 1762500000,
    status: cutOff ? "incomplete" : "completed",
    model: "gpt-4.1-mini-2025-04-14",
    output: [
      {
        type: "message",
        id: "msg_canned",
        status: cutOff ? "incomplete" : "completed",
        role: "assistant",
        content: [{ type: "output_text", text: ANSWER, annotations: [] }],
      },
    ],
    incomplete_details: cutOff ? { reason: "max_output_tokens" } : null,
    usage: {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 20,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 120,
    },
  };
}

function perplexityResponse(finishReason = "stop"): Record<string, unknown> {
  return {
    id: "pplx-1",
    model: "sonar-pro",
    choices: [
      { index: 0, message: { role: "assistant", content: ANSWER }, finish_reason: finishReason },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
    citations: ["https://omegaservices.com.au/"],
  };
}

async function chatgpt(body: Record<string, unknown>) {
  const canned = cannedFetch([body]);
  vi.stubGlobal("fetch", canned.fetchStub);
  const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
  const output = await new OpenAIImpl().complete({
    engine: "chatgpt",
    prompt: PROMPT,
    task: "brand_mention",
    model: "gpt-4.1-mini",
    cacheMode: "fresh",
  });
  return { output, request: canned.requests[0] };
}

async function claude(body: Record<string, unknown>) {
  const canned = cannedFetch([body]);
  vi.stubGlobal("fetch", canned.fetchStub);
  const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
  const output = await new AnthropicImpl().complete({
    engine: "claude",
    prompt: PROMPT,
    task: "brand_mention",
    model: "claude-sonnet-4-6",
    cacheMode: "fresh",
  });
  return { output, request: canned.requests[0] };
}

async function perplexity(body: Record<string, unknown>) {
  const canned = cannedFetch([body]);
  vi.stubGlobal("fetch", canned.fetchStub);
  const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
  const output = await new PerplexityImpl().complete({
    engine: "perplexity",
    prompt: PROMPT,
    task: "brand_mention",
    model: "sonar-pro",
    cacheMode: "fresh",
  });
  return { output, request: canned.requests[0] };
}

describe("each adapter asks for at most 8,192 output tokens", () => {
  it("the limit is 8,192", () => {
    expect(ANSWER_MAX_OUTPUT_TOKENS).toBe(8192);
  });

  it("ChatGPT (Responses API): max_output_tokens 8,192", async () => {
    const { request } = await chatgpt(openaiResponse());
    expect(request.max_output_tokens).toBe(8192);
  });

  it("Claude: max_tokens 8,192, not Sonnet 4.6's own 128,000", async () => {
    const { request } = await claude(anthropicMessage([anthropicText(ANSWER)]));
    expect(request.max_tokens).toBe(8192);
  });

  it("Perplexity: max_tokens 8,192, not 800", async () => {
    const { request } = await perplexity(perplexityResponse());
    expect(request.max_tokens).toBe(8192);
  });
});

describe("an answer that reaches the limit is still kept and flagged as truncated", () => {
  it("ChatGPT max_output_tokens", async () => {
    const { output } = await chatgpt(openaiResponse(true));
    expect(output).toMatchObject({
      response: ANSWER,
      truncated: true,
      stopReason: "max_output_tokens",
    });
  });

  it("Claude max_tokens", async () => {
    const { output } = await claude(anthropicMessage([anthropicText(ANSWER)], "max_tokens", 0));
    expect(output).toMatchObject({ response: ANSWER, truncated: true, stopReason: "max_tokens" });
  });

  it("Perplexity length", async () => {
    const { output } = await perplexity(perplexityResponse("length"));
    expect(output).toMatchObject({ response: ANSWER, truncated: true, stopReason: "length" });
  });

  it("a normal stop is a complete answer", async () => {
    const { output } = await perplexity(perplexityResponse());
    expect(output).toMatchObject({ truncated: false, stopReason: "stop" });
  });
});
