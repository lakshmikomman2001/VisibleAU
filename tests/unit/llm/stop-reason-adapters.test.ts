/**
 * "Mention detection" (6 Nov), part 2 -- an answer that stopped early is not a complete answer. The real
 * adapters parse canned provider responses through the real installed AI SDK (no network): each stop reason
 * ends as an answer that's complete, one kept but flagged as truncated, a paused Claude turn carried on and
 * completed, or a failure with its reason -- never a scored answer from an incomplete one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeEngineFailure } from "@/lib/audit/engine-failure";
import { callCost, sumCallCosts } from "@/lib/audit/compute-cost";
import { classifyError } from "@/lib/llm/classify-error";
import { IncompleteAnswerError } from "@/lib/llm/errors";
import { callWithRetry } from "@/lib/llm/with-retry";
import {
  anthropicCitedText,
  anthropicMessage,
  anthropicSearch,
  anthropicText,
  cannedFetch,
  geminiResponse,
} from "../../helpers/canned-llm-responses";

const { setCachedMock } = vi.hoisted(() => ({ setCachedMock: vi.fn() }));
vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: setCachedMock,
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

/** A paused Claude turn is sent back up to 3 times (lib/llm/stop-reason.ts MAX_PAUSE_TURN_CONTINUATIONS). */
const MAX_PAUSE_TURN_CONTINUATIONS = 3;

/** What one canned Claude request costs (anthropicMessage: 1000 in, 80 out), with its searches' fee. */
const claudeRequest = (searches: number) =>
  callCost("claude", "claude-haiku-4-5", 1000, 80, searches * 0.01);

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
  setCachedMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function claude() {
  const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
  return new AnthropicImpl().complete({
    engine: "claude",
    prompt: "Good plumber in Norwest?",
    task: "brand_mention",
    model: "claude-haiku-4-5",
    cacheMode: "fresh",
  });
}

async function gemini(body: Record<string, unknown>) {
  vi.stubGlobal("fetch", cannedFetch([body]).fetchStub);
  const { GoogleImpl } = await import("@/lib/llm/google-impl");
  return new GoogleImpl().complete({
    engine: "gemini",
    prompt: "Good plumber in Norwest?",
    task: "brand_mention",
    cacheMode: "fresh",
  });
}

async function rejection(promise: Promise<unknown>): Promise<IncompleteAnswerError> {
  const err = await promise.then(
    () => {
      throw new Error("expected the call to fail");
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(IncompleteAnswerError);
  return err as IncompleteAnswerError;
}

const paused = anthropicMessage(
  [
    anthropicText("I'll search for plumbers near Norwest."),
    ...anthropicSearch("srvtoolu_1", ["https://omegaservices.com.au/"]),
  ],
  "pause_turn",
);

describe("Claude pause_turn: the paused turn is sent back to carry on", () => {
  it("continued once and finished: one answer from both requests, both billed, the paused message sent back unchanged", async () => {
    const { fetchStub, requests } = cannedFetch([
      paused,
      anthropicMessage(
        [
          anthropicCitedText(
            "Omega Services is a well-reviewed plumber in Norwest.",
            "https://omegaservices.com.au/",
          ),
        ],
        "end_turn",
        0,
      ),
    ]);
    vi.stubGlobal("fetch", fetchStub);

    const output = await claude();

    expect(requests).toHaveLength(2);
    expect(requests[1].messages).toMatchObject([
      { role: "user" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "I'll search for plumbers near Norwest." },
          { type: "server_tool_use", id: "srvtoolu_1", name: "web_search" },
          {
            type: "web_search_tool_result",
            tool_use_id: "srvtoolu_1",
            content: [{ url: "https://omegaservices.com.au/", encrypted_content: "enc" }],
          },
        ],
      },
    ]);
    expect(output.response).toBe(
      "I'll search for plumbers near Norwest.\nOmega Services is a well-reviewed plumber in Norwest.",
    );
    expect(output.stopReason).toBe("end_turn");
    expect(output.truncated).toBe(false);
    expect(output.costEstimateUsd).toBeCloseTo(
      sumCallCosts([claudeRequest(1), claudeRequest(0)]).usd ?? -1,
      9,
    );
  });

  it(`still paused after ${MAX_PAUSE_TURN_CONTINUATIONS} continuations: a failure with every request's cost, never an answer`, async () => {
    const { fetchStub, requests } = cannedFetch([paused]);
    vi.stubGlobal("fetch", fetchStub);

    const err = await rejection(claude());

    expect(requests).toHaveLength(1 + MAX_PAUSE_TURN_CONTINUATIONS);
    expect(err.costUsd).toBeCloseTo((claudeRequest(1).usd ?? -1) * 4, 9);
    expect(err.stopReason).toBe("pause_turn");
    const classified = classifyError(err);
    expect(classified).toMatchObject({ errorClass: "incomplete_answer", retryable: false });
    expect(
      describeEngineFailure({ errorClass: classified.errorClass, message: classified.message }).key,
    ).toBe("answer_incomplete");
  });

  it("continuing it fails: a failure carrying what the first request cost", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return calls === 1
        ? new Response(JSON.stringify(paused), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        : new Response(
            JSON.stringify({
              type: "error",
              error: { type: "overloaded_error", message: "Overloaded" },
            }),
            {
              status: 529,
              headers: { "content-type": "application/json" },
            },
          );
    });

    const err = await rejection(claude());

    expect(err.message).toMatch(/^Answer incomplete: .*continuing it failed: .*Overloaded/);
    expect(err.costUsd).toBeCloseTo(claudeRequest(1).usd ?? -1, 9);
  });
});

describe("every other stop reason", () => {
  it("Claude end_turn: complete, its stop reason stored, cached", async () => {
    vi.stubGlobal(
      "fetch",
      cannedFetch([anthropicMessage([anthropicText("Omega Services is good.")], "end_turn", 0)])
        .fetchStub,
    );
    const output = await claude();
    expect(output).toMatchObject({
      response: "Omega Services is good.",
      stopReason: "end_turn",
      truncated: false,
    });
    expect(setCachedMock).toHaveBeenCalledTimes(1);
  });

  it("Claude max_tokens: the answer is kept and flagged as truncated, and never cached", async () => {
    vi.stubGlobal(
      "fetch",
      cannedFetch([
        anthropicMessage([anthropicText("Omega Services is a plumber in")], "max_tokens", 0),
      ]).fetchStub,
    );
    const output = await claude();
    expect(output).toMatchObject({
      response: "Omega Services is a plumber in",
      stopReason: "max_tokens",
      truncated: true,
    });
    expect(setCachedMock).not.toHaveBeenCalled();
  });

  it("Claude refusal: the provider stopping the answer is a failure with its reason", async () => {
    vi.stubGlobal(
      "fetch",
      cannedFetch([anthropicMessage([anthropicText("I can't help")], "refusal", 0)]).fetchStub,
    );
    const err = await rejection(claude());
    expect(err.message).toBe("Provider stopped the answer (safety or recitation filter): refusal");
  });

  it("Gemini RECITATION with part of an answer written: a failure with the plain reason, not an answer", async () => {
    const err = await rejection(
      gemini(
        geminiResponse([{ text: "Here are some plumbers in Norwest:\n\n*   " }], "RECITATION"),
      ),
    );

    expect(err.message).toBe(
      "Provider stopped the answer (safety or recitation filter): RECITATION",
    );
    const classified = classifyError(err);
    expect(classified.errorClass).toBe("incomplete_answer");
    expect(
      describeEngineFailure({ errorClass: classified.errorClass, message: classified.message }),
    ).toMatchObject({
      key: "provider_filter",
      label: "Provider stopped the answer (safety or recitation filter)",
    });
  });

  it("Gemini SAFETY with no text at all: the filter is the reason, not an empty answer", async () => {
    const err = await rejection(gemini(geminiResponse([{ text: "" }], "SAFETY")));
    expect(err.stopReason).toBe("SAFETY");
  });

  it("Gemini MAX_TOKENS: kept, flagged as truncated, never cached", async () => {
    const output = await gemini(
      geminiResponse([{ text: "Omega Services is a plumber in" }], "MAX_TOKENS"),
    );
    expect(output).toMatchObject({ stopReason: "MAX_TOKENS", truncated: true });
    expect(setCachedMock).not.toHaveBeenCalled();
  });

  it("Gemini STOP: complete", async () => {
    const output = await gemini(geminiResponse([{ text: "Omega Services is good." }], "STOP"));
    expect(output).toMatchObject({ stopReason: "STOP", truncated: false });
  });
});

describe("an incomplete answer is recorded as a failure, once", () => {
  it("callWithRetry never retries it, and keeps its cost", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(
        new IncompleteAnswerError(
          "Provider stopped the answer (safety or recitation filter): SAFETY",
          "SAFETY",
          0.002,
        ),
      );
    const result = await callWithRetry(fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "failure",
      errorClass: "incomplete_answer",
      attempts: 1,
      costUsd: 0.002,
    });
  });
});
