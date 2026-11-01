/**
 * Engine-failure follow-ups (1 Nov), item 1 -- audit #37's real cause:
 * Anthropic's console said "You have reached your specified API usage
 * limits. You will regain access on Nov 1, 2026 at 00:00 UTC." -- a
 * monthly spend limit set in the console (US$10, 103% used), with
 * US$12.20 of credit left. Not a credit or quota problem, and on
 * 217cce7 it was "not recognised".
 *
 * A spend limit gets its own reason, is checked before credit, and is
 * never retried (every retry is another refused call).
 */
import { describe, expect, it, vi } from "vitest";
import { describeEngineFailure } from "@/lib/audit/engine-failure";
import { classifyError } from "@/lib/llm/classify-error";
import { callWithRetry, failureMessage } from "@/lib/llm/with-retry";

/** What Sri's Anthropic console showed for audit #37. */
const ANTHROPIC_USAGE_LIMIT =
  "You have reached your specified API usage limits. You will regain access on Nov 1, 2026 at 00:00 UTC.";
/** platform.claude.com/docs/en/api/rate-limits, "Reaching your spend cap" (the tier's own cap). */
const ANTHROPIC_TIER_CAP =
  "You have reached your API usage limits: your organization has crossed its monthly API usage threshold, set based on your organization's API tier. You will regain access on 2026-09-01 at 00:00 UTC.";
const CREDIT =
  "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";

/** Shaped like the AI SDK's APICallError: statusCode and the parsed body as `data`. */
function apiCallError(message: string, statusCode: number, data: unknown) {
  return Object.assign(new Error(message), { statusCode, data });
}

const SPEND_LABEL = "Provider spend limit reached (a monthly limit set in the provider's console)";
const SPEND_CHECK =
  "Raise the monthly spend limit in the provider's console, or wait for it to reset.";

describe("a provider spend limit has its own reason (1 Nov, item 1)", () => {
  it("audit #37's sentence, as stored before 217cce7 (no code): spend limit, not credit, not 'not recognised'", () => {
    const r = describeEngineFailure({ errorClass: "other", message: ANTHROPIC_USAGE_LIMIT });
    expect(r.key).toBe("spend_limit");
    expect(r.label).toBe(SPEND_LABEL);
    expect(r.check).toBe(SPEND_CHECK);
  });

  it("the same sentence as stored since 217cce7 (HTTP 400 invalid_request_error)", () => {
    const stored = failureMessage(
      classifyError(
        apiCallError(ANTHROPIC_USAGE_LIMIT, 400, {
          type: "error",
          error: { type: "invalid_request_error", message: ANTHROPIC_USAGE_LIMIT },
        }),
      ),
    );
    expect(stored).toBe(`HTTP 400 invalid_request_error: ${ANTHROPIC_USAGE_LIMIT}`);
    expect(describeEngineFailure({ errorClass: "other", message: stored }).key).toBe("spend_limit");
  });

  it("a workspace limit, the tier's own cap (429), and OpenAI's spend-limit codes", () => {
    for (const message of [
      "HTTP 400 invalid_request_error: You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.",
      `HTTP 429 rate_limit_error (enforced_spend_limit_reached): ${ANTHROPIC_TIER_CAP}`,
      "HTTP 429 insufficient_quota (organization_spend_limit_exceeded): Request refused.",
      "HTTP 429 insufficient_quota (project_spend_limit_exceeded): Request refused.",
      "HTTP 429 insufficient_quota (organization_usage_limit_exceeded): Request refused.",
    ]) {
      expect(describeEngineFailure({ errorClass: "other", message }).key, message).toBe(
        "spend_limit",
      );
    }
  });

  it("a real credit-balance message is still credit", () => {
    for (const message of [CREDIT, `HTTP 400 invalid_request_error: ${CREDIT}`]) {
      const r = describeEngineFailure({ errorClass: "other", message });
      expect(r.key).toBe("account_or_credit");
      expect(r.label).toBe("Provider error: account/credit issue");
    }
    expect(
      describeEngineFailure({
        errorClass: "rate_limited",
        message: "HTTP 429 insufficient_quota (credit_balance_exhausted): No credits remaining.",
      }).key,
    ).toBe("account_or_credit");
  });

  it("an ordinary rate limit is still a rate limit", () => {
    expect(
      describeEngineFailure({
        errorClass: "rate_limited",
        message:
          "HTTP 429 rate_limit_error: This request would exceed the rate limit for your organization of 50,000 input tokens per minute.",
      }).key,
    ).toBe("rate_limited");
  });
});

describe("a spend limit is never retried (1 Nov, item 1)", () => {
  it("Anthropic's 400 for a limit you set: not retryable", () => {
    const c = classifyError(
      apiCallError(ANTHROPIC_USAGE_LIMIT, 400, {
        error: { type: "invalid_request_error", message: ANTHROPIC_USAGE_LIMIT },
      }),
    );
    expect(c.retryable).toBe(false);
  });

  it("Anthropic's tier cap: a 429 rate_limit_error, but not retryable, and its code is kept", () => {
    const c = classifyError(
      apiCallError(ANTHROPIC_TIER_CAP, 429, {
        type: "error",
        error: {
          type: "rate_limit_error",
          message: ANTHROPIC_TIER_CAP,
          details: { error_code: "enforced_spend_limit_reached" },
        },
      }),
    );
    expect(c.retryable).toBe(false);
    expect(c.errorClass).toBe("other");
    expect(failureMessage(c)).toBe(
      `HTTP 429 rate_limit_error (enforced_spend_limit_reached): ${ANTHROPIC_TIER_CAP}`,
    );
  });

  it("OpenAI's 429 organization_spend_limit_exceeded, found by its code alone: not retryable", () => {
    const c = classifyError(
      apiCallError("Request refused.", 429, {
        error: { type: "insufficient_quota", code: "organization_spend_limit_exceeded" },
      }),
    );
    expect(c.retryable).toBe(false);
  });

  it("an ordinary 429 is still retried", () => {
    const c = classifyError(
      apiCallError("Number of requests has exceeded your rate limit", 429, {
        error: { type: "rate_limit_error" },
      }),
    );
    expect(c.errorClass).toBe("rate_limited");
    expect(c.retryable).toBe(true);
  });

  it("callWithRetry: one attempt for a spend-cap 429, recorded with its reason", async () => {
    const fn = vi.fn().mockRejectedValue(
      apiCallError(ANTHROPIC_TIER_CAP, 429, {
        error: {
          type: "rate_limit_error",
          message: ANTHROPIC_TIER_CAP,
          details: { error_code: "enforced_spend_limit_reached" },
        },
      }),
    );
    const result = await callWithRetry(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.attempts).toBe(1);
      expect(
        describeEngineFailure({ errorClass: result.errorClass, message: result.errorMessage }).key,
      ).toBe("spend_limit");
    }
  });
});
