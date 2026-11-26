/**
 * S02 part 0B (LLD amendment 71): a failed audit's stored error, as a customer reads it (the audit page, the JSON
 * export, /api/audits/:id and /full, through customerAuditError). Two groups:
 * - the customer's own setup keeps its words: an unconfirmed business type, the workspace's daily limit;
 * - everything else -- "Budget exceeded", "Timed out", a runner that found no questions or no engines, an unexpected
 *   exception's message -- reads "This audit couldn't finish because of a problem on our side."
 * S03 part 0 (LLD amendment 78): the question generator's failure keeps S01C's own plain sentence.
 */
import { describe, expect, it } from "vitest";
import {
  AUDIT_PROBLEM_ON_OUR_SIDE,
  customerAuditError,
  customerAuditMetadata,
  DAILY_LIMIT_CUSTOMER_MESSAGE,
  QUESTIONS_NOT_REFRESHED,
} from "@/lib/costs/customer-safe";

const CONFIRM =
  "Confirm your business type and location on the brand's page before running an audit.";

describe("the customer's own setup keeps its words", () => {
  it("an unconfirmed business type (BrandNeedsConfirmationError), with or without its code", () => {
    expect(customerAuditError({ error: CONFIRM, errorCode: "BrandNeedsConfirmationError" })).toBe(
      CONFIRM,
    );
    expect(customerAuditError({ error: CONFIRM })).toBe(CONFIRM);
  });

  it("the workspace's daily limit, never its amounts", () => {
    expect(
      customerAuditError({
        error: "Daily spending limit reached: A$4.20 of A$5.00",
        errorCode: "DailySpendCapExceededError",
      }),
    ).toBe(DAILY_LIMIT_CUSTOMER_MESSAGE);
    expect(customerAuditError({ error: "Daily spending limit reached (A$5.00)" })).toBe(
      DAILY_LIMIT_CUSTOMER_MESSAGE,
    );
  });
});

describe("every other stored error is a problem on our side", () => {
  it.each([
    ["the budget estimate", { error: "Budget exceeded", errorCode: "Error" }],
    ["the stale-audit guard", { error: "Timed out" }],
    ["the inline runner with no questions", { error: "No prompts available." }],
    ["the Inngest runner with no questions", { error: "0 prompts." }],
    [
      "no engines for the plan",
      { error: 'Audit a1: resolved 0 engines for tier "free"', errorCode: "Error" },
    ],
    [
      "an unexpected exception",
      { error: "TypeError: Cannot read properties of undefined", errorCode: "TypeError" },
    ],
    ["a code with no message", { errorCode: "Error" }],
  ])("%s", (_name, metadata) => {
    expect(customerAuditError(metadata)).toBe(AUDIT_PROBLEM_ON_OUR_SIDE);
  });

  // S03 part 0, LLD amendment 78: "A question-pack generation failure keeps S01C's plain, more specific sentence:
  // 'Could not refresh this brand's questions before running the audit (a problem on our side).'" -- S02 part 0B had
  // listed it with the errors above.
  it.each([
    [
      "its code and S01C's stored sentence with the model call's detail",
      {
        error:
          "Could not refresh this brand's questions before running the audit (HTTP 400 invalid_request_error)",
        errorCode: "PromptPackGenerationError",
      },
    ],
    ["its code alone", { errorCode: "PromptPackGenerationError" }],
    [
      "its stored sentence alone (no code stored with it)",
      { error: "Could not refresh this brand's questions before running the audit (timeout)" },
    ],
  ])("the question generator, %s: S01C's sentence, without the detail", (_name, metadata) => {
    expect(customerAuditError(metadata)).toBe(QUESTIONS_NOT_REFRESHED);
    expect(QUESTIONS_NOT_REFRESHED).toBe(
      "Could not refresh this brand's questions before running the audit (a problem on our side).",
    );
  });

  it('reads "This audit couldn\'t finish because of a problem on our side."', () => {
    expect(AUDIT_PROBLEM_ON_OUR_SIDE).toBe(
      "This audit couldn't finish because of a problem on our side.",
    );
  });

  it("nothing stored: nothing to say (null), and metadata passes through unchanged", () => {
    expect(customerAuditError(null)).toBeNull();
    expect(customerAuditError({ engineFailures: [] })).toBeNull();
    expect(customerAuditMetadata({ engineFailures: [] })).toEqual({ engineFailures: [] });
  });

  it("the metadata a customer response carries has the plain reason in place of the stored one", () => {
    expect(
      customerAuditMetadata({ error: "Budget exceeded", errorCode: "Error", runs: 1 }),
    ).toEqual({
      error: AUDIT_PROBLEM_ON_OUR_SIDE,
      errorCode: "Error",
      runs: 1,
    });
  });
});
