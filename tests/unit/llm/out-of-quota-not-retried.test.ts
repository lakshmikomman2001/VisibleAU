/**
 * Out-of-quota follow-up (1 Nov, Sri's decision) -- a provider error that
 * says the account is out of quota or credit is never retried, the same
 * rule 4c9e2bc gave a spend limit. Ordinary rate limits are still retried.
 *
 * OpenAI sends both as HTTP 429 (developers.openai.com/api/docs/guides/
 * error-codes): out of quota with error.type "insufficient_quota"
 * ("Retrying billing, spend, or quota errors won't restore API access"),
 * a rate limit with error.code "rate_limit_exceeded" or "slow_down". On
 * the old code every 429 that wasn't a spend limit was rate_limited: 3
 * attempts.
 *
 * Gemini's generateContent documents no out-of-quota code: its 429
 * RESOURCE_EXHAUSTED is retry-with-backoff (ai.google.dev/gemini-api/docs/
 * troubleshooting), and carries the same "You exceeded your current
 * quota, please check your plan and billing details" sentence for a
 * per-minute rate limit -- so the message alone mustn't stop a retry when
 * the provider gave a type. Its depleted Prepay credits are a 402, which
 * was never retried ("Do not retry on client errors (like 400, 402, or
 * 403)"). Perplexity documents 429 as a rate limit only
 * (docs.perplexity.ai/guides/perplexity-sdk-error-handling).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeEngineFailure } from "@/lib/audit/engine-failure";
import { classifyError } from "@/lib/llm/classify-error";
import type { CompleteOutput } from "@/lib/llm/interface";
import { callWithRetry, failureMessage } from "@/lib/llm/with-retry";

/** OpenAI's insufficient_quota sentence. */
const OUT_OF_QUOTA = "You exceeded your current quota, please check your plan and billing details.";
const CREDIT_LABEL = "Provider error: account/credit issue";
const CREDIT_CHECK =
  "The provider says the account is out of credit or over its quota. Check billing and credits in the provider's console.";

/** Shaped like the AI SDK's APICallError: statusCode and the parsed body as `data`. */
function apiCallError(message: string, statusCode: number, data?: unknown) {
  return Object.assign(new Error(message), { statusCode, ...(data ? { data } : {}) });
}

/** OpenAI's body, as @ai-sdk/openai parses it (openaiErrorDataSchema: message, type, param, code). */
function openAiError(message: string, type: string | null, code: string | null) {
  return apiCallError(message, 429, { error: { message, type, param: null, code } });
}

/** Gemini's generateContent body, as @ai-sdk/google parses it (googleErrorDataSchema: code, message, status). */
const GEMINI_429 = apiCallError(
  `${OUT_OF_QUOTA} For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.`,
  429,
  { error: { code: 429, message: OUT_OF_QUOTA, status: "RESOURCE_EXHAUSTED" } },
);

const ANSWER: CompleteOutput = {
  response: "An answer",
  model: "gpt-4o-mini",
  tokensUsed: 10,
  costEstimateUsd: 0.001,
  isCacheHit: false,
};

/** callWithRetry on the fake clock, so a retry's backoff doesn't take real time. */
async function callOnFakeClock(fn: () => Promise<CompleteOutput>) {
  vi.useFakeTimers();
  const pending = callWithRetry(fn);
  await vi.advanceTimersByTimeAsync(10_000);
  return pending;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("OpenAI's 429 insufficient_quota is not retried", () => {
  it("classified as not retryable, kept with its type, and named credit/quota", () => {
    const c = classifyError(openAiError(OUT_OF_QUOTA, "insufficient_quota", "insufficient_quota"));
    expect(c.retryable).toBe(false);
    expect(c.errorClass).toBe("other");
    const stored = failureMessage(c);
    expect(stored).toBe(`HTTP 429 insufficient_quota: ${OUT_OF_QUOTA}`);
    const reason = describeEngineFailure({ errorClass: c.errorClass, message: stored });
    expect(reason.key).toBe("account_or_credit");
    expect(reason.label).toBe(CREDIT_LABEL);
    expect(reason.check).toBe(CREDIT_CHECK);
  });

  it("callWithRetry: one attempt, recorded once with the credit/quota reason", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(openAiError(OUT_OF_QUOTA, "insufficient_quota", "insufficient_quota"));
    const result = await callOnFakeClock(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("failure");
    if (result.status !== "failure") return;
    expect(result.attempts).toBe(1);
    expect(result.errorClass).toBe("other");
    expect(
      describeEngineFailure({ errorClass: result.errorClass, message: result.errorMessage }).key,
    ).toBe("account_or_credit");
  });

  it("found from the type alone, or the code alone, whatever the message says", async () => {
    for (const err of [
      openAiError("Request refused.", "insufficient_quota", null),
      openAiError("Request refused.", null, "insufficient_quota"),
      openAiError("No credits remaining.", "insufficient_quota", "credit_balance_exhausted"),
    ]) {
      const fn = vi.fn().mockRejectedValue(err);
      const result = await callOnFakeClock(fn);
      expect(fn, err.message).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("failure");
      if (result.status === "failure") {
        expect(
          describeEngineFailure({ errorClass: result.errorClass, message: result.errorMessage })
            .key,
        ).toBe("account_or_credit");
      }
      vi.useRealTimers();
    }
  });

  it("a 429 whose body wasn't parsed (no type or code): the message decides", () => {
    const c = classifyError(apiCallError(OUT_OF_QUOTA, 429));
    expect(c.retryable).toBe(false);
    expect(failureMessage(c)).toBe(`HTTP 429: ${OUT_OF_QUOTA}`);
  });

  it("a spend limit is still a spend limit (4c9e2bc), checked first", () => {
    const c = classifyError(
      openAiError("Request refused.", "insufficient_quota", "organization_spend_limit_exceeded"),
    );
    expect(c.retryable).toBe(false);
    expect(
      describeEngineFailure({ errorClass: c.errorClass, message: failureMessage(c) }).key,
    ).toBe("spend_limit");
  });
});

describe("an ordinary rate limit is still retried", () => {
  it("OpenAI's rate_limit_exceeded, even when its message links to the billing page: retried, and succeeds", async () => {
    for (const err of [
      openAiError(
        "Rate limit reached for gpt-4o-mini on requests per min (RPM): Limit 500, Used 500, Requested 1. Please try again in 120ms.",
        "requests",
        "rate_limit_exceeded",
      ),
      openAiError(
        "Rate limit reached for gpt-4o-mini on tokens per min (TPM). Add a payment method at https://platform.openai.com/account/billing to increase your rate limit.",
        "tokens",
        "rate_limit_exceeded",
      ),
      openAiError("Please slow down.", "rate_limit_error", "slow_down"),
    ]) {
      expect(classifyError(err).errorClass, err.message).toBe("rate_limited");
      const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(ANSWER);
      const result = await callOnFakeClock(fn);
      expect(fn, err.message).toHaveBeenCalledTimes(2);
      expect(result.status).toBe("success");
      if (result.status === "success") expect(result.attempts).toBe(2);
      vi.useRealTimers();
    }
  });

  it("OpenAI's rate limit that keeps failing: 3 attempts, as before", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(openAiError("Rate limit reached.", "requests", "rate_limit_exceeded"));
    const result = await callOnFakeClock(fn);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result.status).toBe("failure");
    if (result.status === "failure") expect(result.errorClass).toBe("rate_limited");
  });

  it("Gemini's 429 RESOURCE_EXHAUSTED, which says 'exceeded your current quota' for a per-minute limit too: retried, and succeeds", async () => {
    expect(classifyError(GEMINI_429).errorClass).toBe("rate_limited");
    const fn = vi.fn().mockRejectedValueOnce(GEMINI_429).mockResolvedValueOnce(ANSWER);
    const result = await callOnFakeClock(fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("success");
  });

  it("Anthropic's rate_limit_error and Perplexity's 429: retried", () => {
    for (const err of [
      apiCallError("Number of requests has exceeded your rate limit", 429, {
        type: "error",
        error: {
          type: "rate_limit_error",
          message: "Number of requests has exceeded your rate limit",
        },
      }),
      new Error("Perplexity API 429: Rate limit exceeded, please retry later"),
    ]) {
      const c = classifyError(err);
      expect(c.errorClass, err.message).toBe("rate_limited");
      expect(c.retryable).toBe(true);
    }
  });
});

describe("Gemini's depleted Prepay credits (402): not retried, as before", () => {
  it("one attempt, named credit/quota", async () => {
    const fn = vi.fn().mockRejectedValue(apiCallError("Payment required.", 402));
    const result = await callOnFakeClock(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    if (result.status === "failure") {
      expect(
        describeEngineFailure({ errorClass: result.errorClass, message: result.errorMessage }).key,
      ).toBe("account_or_credit");
    }
  });
});
