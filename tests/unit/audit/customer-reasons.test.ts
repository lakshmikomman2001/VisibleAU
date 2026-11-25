/**
 * S01C part 1 (LLD amendment 58): one mapper for what a customer is told about an engine that didn't answer, and the
 * question generator's failure (a whole audit) in the same plain words.
 */
import { describe, expect, it } from "vitest";
import {
  customerEngineReason,
  customerEngineReasonLabel,
  customerNoAnswerClause,
  PROBLEM_ON_OUR_SIDE,
} from "@/lib/audit/customer-reasons";
import { describeEngineFailure, type EngineFailureReasonKey } from "@/lib/audit/engine-failure";
import { googleCustomerReason } from "@/lib/audit/google-surfaces/reasons";
import { customerAuditError, DAILY_LIMIT_CUSTOMER_MESSAGE } from "@/lib/costs/customer-safe";
import { FAILURE_MESSAGE_SAMPLES } from "@/tests/helpers/failure-message-samples";

const KEYS: EngineFailureReasonKey[] = [
  "spend_limit",
  "search_daily_limit",
  "account_or_credit",
  "authentication",
  "permission",
  "model_not_found",
  "rate_limited",
  "overloaded",
  "timeout",
  "search_tool",
  "empty_response",
  "parse_error",
  "answer_incomplete",
  "provider_filter",
  "request_rejected",
  "provider_server_error",
  "unknown",
];

const INTERNAL = [
  /spend limit/i,
  /quota/i,
  /credit/i,
  /billing/i,
  /rate limit/i,
  /API key/i,
  /\d{3}/,
];

describe("customerEngineReason", () => {
  it.each(KEYS)("%s reads as a problem on our side", (key) => {
    expect(customerEngineReason({ key })).toBe("a problem on our side");
    expect(customerEngineReasonLabel({ key })).toBe("A problem on our side");
  });

  it("every stored failure message the classifier knows maps to words with none of the operator's terms", () => {
    for (const sample of FAILURE_MESSAGE_SAMPLES) {
      const reason = describeEngineFailure({
        errorClass: "other",
        message: sample.message,
      });
      const text = customerEngineReason(reason);
      for (const re of INTERNAL) expect(text, `${sample.message} -> ${text}`).not.toMatch(re);
    }
  });

  it("no reason known: the same plain words", () => {
    expect(customerEngineReason(null)).toBe(PROBLEM_ON_OUR_SIDE);
  });

  it("Google's 'problem on our side' sentence is built from the same words, unchanged", () => {
    expect(
      googleCustomerReason({ outcome: "failed", providerStatusCode: 40100, outcomeReason: null }),
    ).toBe(
      "Google couldn't be checked this time because of a problem on our side. It will be checked again on the next audit.",
    );
  });
});

describe("customerNoAnswerClause", () => {
  it("one engine, and engines sharing the reason", () => {
    expect(customerNoAnswerClause([{ name: "Claude", reason: PROBLEM_ON_OUR_SIDE }])).toBe(
      "Claude didn't answer: a problem on our side",
    );
    expect(
      customerNoAnswerClause([
        { name: "Claude", reason: PROBLEM_ON_OUR_SIDE },
        { name: "Gemini", reason: PROBLEM_ON_OUR_SIDE },
      ]),
    ).toBe("Claude and Gemini didn't answer: a problem on our side");
  });
});

describe("customerAuditError (a whole audit's stored error)", () => {
  it("the question generator's failure: the plain reason, never the model call's message", () => {
    const text = customerAuditError({
      error:
        "Could not refresh this brand's questions before running the audit (HTTP 400 invalid_request_error: You have reached your specified API usage limits. You will regain access on Dec 1, 2026 at 00:00 UTC.).",
      errorCode: "PromptPackGenerationError",
    });
    expect(text).toBe(
      "Could not refresh this brand's questions before running the audit (a problem on our side).",
    );
  });

  it("reasons about the customer's own setup keep their words", () => {
    const confirm =
      "Confirm your business type and location on the brand's page before running an audit.";
    expect(customerAuditError({ error: confirm, errorCode: "BrandNeedsConfirmationError" })).toBe(
      confirm,
    );
    expect(customerAuditError({ errorCode: "DailySpendCapExceededError" })).toBe(
      DAILY_LIMIT_CUSTOMER_MESSAGE,
    );
  });
});
