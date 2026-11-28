/**
 * S04B part 2 (LLD amendment 100): a refusal because a spend limit, credit or quota on our provider account is reached
 * is error_class "provider_quota", never retried -- each shape as the provider's docs name it (quoted in
 * lib/llm/classify-error.ts, read 28 Nov 2026). An ordinary rate limit stays a rate limit. The customer-facing reason
 * is unchanged ("a problem on our side"), and a call not sent after a refusal names the same operator reason.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { customerEngineReason } from "@/lib/audit/customer-reasons";
import { describeEngineFailure } from "@/lib/audit/engine-failure";
import { notSentFailure, notSentMessage } from "@/lib/audit/provider-quota";
import { classifyError } from "@/lib/llm/classify-error";
import { callWithRetry, failureMessage } from "@/lib/llm/with-retry";

vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

/** Shaped like the AI SDK's APICallError: statusCode and the parsed body as `data`. */
function apiCallError(message: string, statusCode: number, data: unknown) {
  return Object.assign(new Error(message), { statusCode, data });
}

const ANTHROPIC_LIMIT =
  "You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.";
const ANTHROPIC_WORKSPACE_LIMIT =
  "You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.";
const ANTHROPIC_TIER_CAP =
  "You have reached your API usage limits: your organization has crossed its monthly API usage threshold. You will regain access on 2026-12-01 at 00:00 UTC.";

const QUOTA_SHAPES: Array<[string, unknown]> = [
  [
    "Anthropic 400 invalid_request_error: a spend limit you set",
    apiCallError(ANTHROPIC_LIMIT, 400, {
      type: "error",
      error: { type: "invalid_request_error", message: ANTHROPIC_LIMIT },
    }),
  ],
  [
    "Anthropic 400 invalid_request_error: a workspace spend limit",
    apiCallError(ANTHROPIC_WORKSPACE_LIMIT, 400, {
      type: "error",
      error: { type: "invalid_request_error", message: ANTHROPIC_WORKSPACE_LIMIT },
    }),
  ],
  [
    "Anthropic 429 rate_limit_error with error.details.error_code enforced_spend_limit_reached",
    apiCallError(ANTHROPIC_TIER_CAP, 429, {
      type: "error",
      error: {
        type: "rate_limit_error",
        message: ANTHROPIC_TIER_CAP,
        details: { error_code: "enforced_spend_limit_reached" },
      },
    }),
  ],
  [
    "Anthropic 402 billing_error",
    apiCallError("There's an issue with your billing or payment information.", 402, {
      type: "error",
      error: {
        type: "billing_error",
        message: "There's an issue with your billing or payment information.",
      },
    }),
  ],
  [
    "OpenAI 429 insufficient_quota",
    apiCallError(
      "You exceeded your current quota, please check your plan and billing details.",
      429,
      {
        error: {
          message: "You exceeded your current quota, please check your plan and billing details.",
          type: "insufficient_quota",
          code: "insufficient_quota",
        },
      },
    ),
  ],
  [
    "OpenAI 429 credit_balance_exhausted",
    apiCallError("Your prepaid credit balance is depleted.", 429, {
      error: { type: "insufficient_quota", code: "credit_balance_exhausted" },
    }),
  ],
  [
    "OpenAI 429 organization_spend_limit_exceeded",
    apiCallError("Your organization has reached its spend limit.", 429, {
      error: { type: "insufficient_quota", code: "organization_spend_limit_exceeded" },
    }),
  ],
  [
    "OpenAI 429 project_spend_limit_exceeded",
    apiCallError("Your project has reached its spend limit.", 429, {
      error: { type: "insufficient_quota", code: "project_spend_limit_exceeded" },
    }),
  ],
  [
    "Gemini 402 payment_required (Prepay credits depleted)",
    apiCallError("Your Prepay credit balance is depleted.", 402, {
      error: {
        code: 402,
        message: "Your Prepay credit balance is depleted.",
        status: "payment_required",
      },
    }),
  ],
  [
    "Gemini 400 FAILED_PRECONDITION: billing disabled",
    apiCallError("Billing is disabled for this project. Enable billing to continue.", 400, {
      error: {
        code: 400,
        message: "Billing is disabled for this project. Enable billing to continue.",
        status: "FAILED_PRECONDITION",
      },
    }),
  ],
  [
    "Gemini 403 PERMISSION_DENIED citing an outstanding balance",
    apiCallError("Your project has an outstanding balance. Pay it to continue.", 403, {
      error: {
        code: 403,
        message: "Your project has an outstanding balance. Pay it to continue.",
        status: "PERMISSION_DENIED",
      },
    }),
  ],
  [
    "Perplexity 402 Payment Required (out of credits)",
    new Error("Perplexity API 402: Payment Required"),
  ],
];

const NOT_QUOTA: Array<[string, unknown, string]> = [
  [
    "Anthropic 429 rate_limit_error (an ordinary rate limit)",
    apiCallError("Number of requests has exceeded your rate limit", 429, {
      error: {
        type: "rate_limit_error",
        message: "Number of requests has exceeded your rate limit",
      },
    }),
    "rate_limited",
  ],
  [
    "OpenAI 429 rate_limit_exceeded",
    apiCallError("Rate limit reached for requests", 429, {
      error: { type: "requests", code: "rate_limit_exceeded" },
    }),
    "rate_limited",
  ],
  [
    "Gemini 429 RESOURCE_EXHAUSTED, a per-minute limit with the billing sentence",
    apiCallError(
      "You exceeded your current quota, please check your plan and billing details.",
      429,
      {
        error: {
          code: 429,
          message: "You exceeded your current quota, please check your plan and billing details.",
          status: "RESOURCE_EXHAUSTED",
        },
      },
    ),
    "rate_limited",
  ],
  [
    "Perplexity 429 request_rate_limit_exceeded",
    Object.assign(new Error("Perplexity API 429: rate limited"), {
      data: { error: { type: "request_rate_limit_exceeded", code: 429 } },
    }),
    "rate_limited",
  ],
  [
    "Gemini 403 PERMISSION_DENIED that isn't billing (a key's permission)",
    apiCallError("Your project has been denied access.", 403, {
      error: {
        code: 403,
        message: "Your project has been denied access.",
        status: "PERMISSION_DENIED",
      },
    }),
    "other",
  ],
];

describe("spend, credit and quota refusals are provider_quota, never retried", () => {
  it.each(QUOTA_SHAPES)("%s", (_name, err) => {
    const c = classifyError(err);
    expect(c.errorClass).toBe("provider_quota");
    expect(c.retryable).toBe(false);
    expect(c.costUsd).toBe(0);
  });

  it.each(NOT_QUOTA)("not a quota refusal: %s", (_name, err, expected) => {
    expect(classifyError(err).errorClass).toBe(expected);
  });

  it("Gemini's daily grounded-search limit stays a rate limit, not retried (methodology v2.2)", () => {
    const message =
      "You exceeded your current quota. * Quota exceeded for metric: generativelanguage.googleapis.com/search_grounding_requests, limit: 1500";
    const c = classifyError(
      apiCallError(message, 429, { error: { code: 429, message, status: "RESOURCE_EXHAUSTED" } }),
    );
    expect(c).toMatchObject({ errorClass: "rate_limited", retryable: false });
  });

  it("callWithRetry makes one attempt and records the class with the provider's words", async () => {
    const fn = vi.fn().mockRejectedValue(QUOTA_SHAPES[0][1]);
    const result = await callWithRetry(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "failure", errorClass: "provider_quota", attempts: 1 });
    if (result.status === "failure") {
      expect(result.errorMessage).toBe(`HTTP 400 invalid_request_error: ${ANTHROPIC_LIMIT}`);
    }
  });

  it("Perplexity's 402 through the real adapter (Agent API) is provider_quota", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        headers: new Headers(),
        text: async () => "Payment Required",
        json: async () => ({}),
      }),
    );
    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const err = await new PerplexityImpl()
      .complete({ engine: "perplexity", prompt: "Q?", task: "brand_mention", model: "sonar" })
      .catch((e) => e);
    expect(classifyError(err)).toMatchObject({ errorClass: "provider_quota", retryable: false });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("what the operator and the customer are told", () => {
  it("a refusal and a call not sent after it name the same operator reason; customers see a problem on our side", () => {
    const stored = failureMessage(classifyError(QUOTA_SHAPES[0][1]));
    const refusal = describeEngineFailure({ errorClass: "provider_quota", message: stored });
    const notSent = describeEngineFailure({
      errorClass: "provider_quota",
      message: notSentMessage("claude", stored),
    });
    expect(refusal.key).toBe("spend_limit");
    expect(notSent.key).toBe("spend_limit");
    expect(customerEngineReason(refusal)).toBe("a problem on our side");
    expect(customerEngineReason(notSent)).toBe("a problem on our side");
  });

  it("a provider_quota whose words name nothing still reads as an account or credit problem", () => {
    expect(describeEngineFailure({ errorClass: "provider_quota", message: "Refused." }).key).toBe(
      "account_or_credit",
    );
  });

  it("a call not sent: same class, no request (attempts 0), nothing billed, the refusal's message kept", () => {
    expect(notSentFailure("claude", "HTTP 400 invalid_request_error: limit")).toEqual({
      status: "failure",
      errorClass: "provider_quota",
      errorMessage:
        "Not sent: Claude refused an earlier call in this audit. HTTP 400 invalid_request_error: limit",
      attempts: 0,
      latencyMs: 0,
      costUsd: 0,
      capReserveUsd: 0,
    });
    expect(notSentMessage("claude", "x".repeat(600))).toHaveLength(500);
  });
});
