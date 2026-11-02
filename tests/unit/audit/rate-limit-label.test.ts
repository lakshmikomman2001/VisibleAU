/**
 * A rate-limited engine says "rate limit", never "check billing" (2 Nov,
 * Sri's decision). Gemini's per-minute rate limit is a 429
 * RESOURCE_EXHAUSTED whose sentence is "You exceeded your current quota,
 * please check your plan and billing details", and an OpenAI rate limit can
 * link to its billing page: both matched the credit/quota words, so the
 * banner, the alert email, the portal and diag-0108 said "account/credit
 * issue". A 429's own type or code now decides before the message (after
 * the spend limit and out of quota). Only the label changes: the retry
 * decision (lib/llm/classify-error.ts) is the same as before.
 */
import { describe, expect, it } from "vitest";
import { describeEngineFailure } from "@/lib/audit/engine-failure";
import { classifyError } from "@/lib/llm/classify-error";
import { failureMessage } from "@/lib/llm/with-retry";
import {
  FAILURE_MESSAGE_SAMPLES,
  GEMINI_RATE_LIMIT_SENTENCE,
  OPENAI_OUT_OF_QUOTA_SENTENCE,
  OPENAI_RATE_LIMIT_BILLING_SENTENCE,
} from "@/tests/helpers/failure-message-samples";

const RATE_LIMIT_LABEL = "Provider rate limit (too many requests at once)";
const RATE_LIMIT_CHECK =
  "Usually temporary. If it keeps happening, lower audit concurrency or raise the provider's rate limit tier.";
const CREDIT_LABEL = "Provider error: account/credit issue";
const SPEND_LABEL = "Provider spend limit reached (a monthly limit set in the provider's console)";

/** Shaped like the AI SDK's APICallError: statusCode and the parsed body as `data`. */
function apiCallError(message: string, statusCode: number, data: unknown) {
  return Object.assign(new Error(message), { statusCode, data });
}

/** What a failed call stores and how the app names it -- the real path. */
function storedAndNamed(err: Error) {
  const c = classifyError(err);
  const message = failureMessage(c);
  return { c, message, reason: describeEngineFailure({ errorClass: c.errorClass, message }) };
}

describe("a rate limit is named a rate limit (2 Nov)", () => {
  it("Gemini's 429 RESOURCE_EXHAUSTED with 'check your plan and billing details': rate limit, not credit -- and still retried", () => {
    const { c, message, reason } = storedAndNamed(
      apiCallError(GEMINI_RATE_LIMIT_SENTENCE, 429, {
        error: { code: 429, message: GEMINI_RATE_LIMIT_SENTENCE, status: "RESOURCE_EXHAUSTED" },
      }),
    );
    expect(c.errorClass).toBe("rate_limited");
    expect(c.retryable).toBe(true);
    expect(message).toBe(`HTTP 429 RESOURCE_EXHAUSTED: ${GEMINI_RATE_LIMIT_SENTENCE}`);
    expect(reason.key).toBe("rate_limited");
    expect(reason.label).toBe(RATE_LIMIT_LABEL);
    expect(reason.check).toBe(RATE_LIMIT_CHECK);
    expect(`${reason.label} ${reason.check}`).not.toMatch(/billing|credit/i);
  });

  it("OpenAI's 429 rate_limit_exceeded whose message links to billing: rate limit -- and still retried", () => {
    const { c, reason } = storedAndNamed(
      apiCallError(OPENAI_RATE_LIMIT_BILLING_SENTENCE, 429, {
        error: {
          message: OPENAI_RATE_LIMIT_BILLING_SENTENCE,
          type: "tokens",
          param: null,
          code: "rate_limit_exceeded",
        },
      }),
    );
    expect(c.errorClass).toBe("rate_limited");
    expect(c.retryable).toBe(true);
    expect(reason.key).toBe("rate_limited");
    expect(reason.label).toBe(RATE_LIMIT_LABEL);
  });

  it("OpenAI's 429 insufficient_quota: still credit/quota -- and still not retried", () => {
    const { c, reason } = storedAndNamed(
      apiCallError(OPENAI_OUT_OF_QUOTA_SENTENCE, 429, {
        error: {
          message: OPENAI_OUT_OF_QUOTA_SENTENCE,
          type: "insufficient_quota",
          param: null,
          code: "insufficient_quota",
        },
      }),
    );
    expect(c.retryable).toBe(false);
    expect(reason.key).toBe("account_or_credit");
    expect(reason.label).toBe(CREDIT_LABEL);
  });

  it("a spend limit: still the spend-limit label, first", () => {
    for (const err of [
      apiCallError("Request refused.", 429, {
        error: { type: "insufficient_quota", code: "organization_spend_limit_exceeded" },
      }),
      apiCallError("You have reached your API usage limits.", 429, {
        error: {
          type: "rate_limit_error",
          message: "You have reached your API usage limits.",
          details: { error_code: "enforced_spend_limit_reached" },
        },
      }),
    ]) {
      const { c, reason } = storedAndNamed(err);
      expect(c.retryable, err.message).toBe(false);
      expect(reason.key, err.message).toBe("spend_limit");
      expect(reason.label).toBe(SPEND_LABEL);
    }
  });
});

describe("every stored sample gets its reason", () => {
  for (const s of FAILURE_MESSAGE_SAMPLES) {
    it(s.name, () => {
      expect(describeEngineFailure({ errorClass: s.errorClass, message: s.message }).key).toBe(
        s.reason,
      );
    });
  }
});
