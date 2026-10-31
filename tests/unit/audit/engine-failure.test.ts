/**
 * URGENT audit #37 (31 Oct), item 2 -- the plain reason for a failed
 * engine call, its HTTP status, and which engines answered nothing.
 */
import { describe, expect, it } from "vitest";
import {
  describeEngineFailure,
  engineCoverageLabel,
  engineTotalFailureSentence,
  fullyFailedEngines,
  statusCodeFromMessage,
  summarizeEngineFailures,
} from "@/lib/audit/engine-failure";
import { classifyError } from "@/lib/llm/classify-error";
import { failureMessage } from "@/lib/llm/with-retry";

const CREDIT =
  "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";

/** Shaped like the AI SDK's APICallError: statusCode and the parsed body as `data`. */
function apiCallError(message: string, statusCode: number, data: unknown) {
  return Object.assign(new Error(message), { statusCode, data });
}

describe("the stored failure message names the status and the provider's error type", () => {
  it("an Anthropic 400 invalid_request_error", () => {
    const err = apiCallError(CREDIT, 400, {
      type: "error",
      error: { type: "invalid_request_error", message: CREDIT },
    });
    const c = classifyError(err);
    expect(c.errorClass).toBe("other");
    expect(c.retryable).toBe(false);
    expect(failureMessage(c)).toBe(`HTTP 400 invalid_request_error: ${CREDIT}`);
  });

  it("an OpenAI 429 insufficient_quota keeps its code", () => {
    const err = apiCallError("You exceeded your current quota", 429, {
      error: { type: "insufficient_quota", code: "insufficient_quota" },
    });
    expect(failureMessage(classifyError(err))).toBe(
      "HTTP 429 insufficient_quota: You exceeded your current quota",
    );
  });

  it("a timeout has no status, so no prefix", () => {
    const err = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    expect(failureMessage(classifyError(err))).toBe("The operation was aborted");
  });

  it("only a bare identifier is kept as the type, never free text", () => {
    const err = apiCallError("x", 400, { error: { type: "not an identifier!" } });
    expect(failureMessage(classifyError(err))).toBe("HTTP 400: x");
  });
});

describe("statusCodeFromMessage", () => {
  it("reads the HTTP prefix, a Perplexity-style code, or nothing", () => {
    expect(statusCodeFromMessage("HTTP 401 authentication_error: invalid x-api-key")).toBe(401);
    expect(statusCodeFromMessage("Perplexity API 429: rate limited")).toBe(429);
    expect(statusCodeFromMessage(CREDIT)).toBeNull();
    expect(statusCodeFromMessage("prompt is too long: 201234 tokens")).toBeNull();
    expect(statusCodeFromMessage(null)).toBeNull();
  });
});

describe("describeEngineFailure", () => {
  const cases: Array<[string, string, string | null, string]> = [
    ["Anthropic credit balance (no code, pre-change)", "other", CREDIT, "account_or_credit"],
    [
      "Anthropic credit balance (with code)",
      "other",
      `HTTP 400 invalid_request_error: ${CREDIT}`,
      "account_or_credit",
    ],
    [
      "OpenAI quota (429, retried as rate_limited)",
      "rate_limited",
      "HTTP 429 insufficient_quota: You exceeded your current quota",
      "account_or_credit",
    ],
    ["401 bad key", "other", "HTTP 401 authentication_error: invalid x-api-key", "authentication"],
    ["missing key", "other", "PERPLEXITY_API_KEY is not configured", "authentication"],
    ["403", "other", "HTTP 403 permission_error: not allowed", "permission"],
    ["404 retired model", "other", "HTTP 404 not_found_error: model: claude-x", "model_not_found"],
    [
      "429 rate limit",
      "rate_limited",
      "HTTP 429 rate_limit_error: Number of requests has exceeded",
      "rate_limited",
    ],
    ["529 overloaded", "overloaded", "HTTP 529 overloaded_error: Overloaded", "overloaded"],
    ["timeout", "timeout", "The operation was aborted", "timeout"],
    ["500", "other", "HTTP 500 api_error: Internal server error", "provider_server_error"],
    ["413", "other", "HTTP 413 request_too_large: too big", "request_rejected"],
    ["nothing known", "other", "something odd", "unknown"],
  ];
  for (const [name, errorClass, message, key] of cases) {
    it(name, () => {
      expect(describeEngineFailure({ errorClass, message }).key).toBe(key);
    });
  }

  it("the label is plain text, never the provider's message", () => {
    const r = describeEngineFailure({ errorClass: "other", message: CREDIT });
    expect(r.label).toBe("Provider error: account/credit issue");
    expect(r.label).not.toContain("credit balance");
    expect(r.check).not.toContain("Anthropic API");
  });
});

describe("summarizeEngineFailures", () => {
  it("per engine: the count and the most common reason", () => {
    const rows = [
      ...Array.from({ length: 12 }, () => ({
        engine: "claude",
        errorClass: "other",
        errorMessage: CREDIT,
      })),
      { engine: "claude", errorClass: "timeout", errorMessage: "aborted" },
      { engine: "gemini", errorClass: "timeout", errorMessage: "aborted" },
    ];
    const s = summarizeEngineFailures(rows);
    expect(s.get("claude")).toMatchObject({ failed: 13, reason: { key: "account_or_credit" } });
    expect(s.get("gemini")).toMatchObject({ failed: 1, reason: { key: "timeout" } });
  });
});

describe("which engines answered nothing", () => {
  const engines = ["chatgpt", "claude", "gemini", "perplexity"];
  it("audit #37: Claude failed all 13 -> 3 of 4 engines", () => {
    const audit = { engines, promptsCount: 13, metadata: { engineFailures: { claude: 13 } } };
    expect(fullyFailedEngines(audit)).toEqual(["claude"]);
    expect(engineCoverageLabel(audit)).toBe("3 of 4 engines");
  });

  it("audit #36: one failure isn't a whole engine", () => {
    const audit = { engines, promptsCount: 13, metadata: { engineFailures: { claude: 1 } } };
    expect(fullyFailedEngines(audit)).toEqual([]);
    expect(engineCoverageLabel(audit)).toBeNull();
  });

  it("no metadata, a running audit, or junk: nothing", () => {
    expect(fullyFailedEngines({ engines, promptsCount: null, metadata: {} })).toEqual([]);
    expect(fullyFailedEngines({ engines, promptsCount: 13, metadata: null })).toEqual([]);
    expect(
      fullyFailedEngines({
        engines,
        promptsCount: 13,
        metadata: { engineFailures: { claude: "13" } },
      }),
    ).toEqual([]);
  });

  it("the banner sentence", () => {
    expect(
      engineTotalFailureSentence({
        engines: ["claude"],
        questionCount: 13,
        enginesAsked: 4,
        answerCount: 30,
      }),
    ).toBe(
      "Claude returned an error for all 13 questions, so this audit's Visibility is based on 3 engines (30 answers).",
    );
    expect(
      engineTotalFailureSentence({
        engines: ["claude", "gemini"],
        questionCount: 13,
        enginesAsked: 4,
        answerCount: 20,
      }),
    ).toBe(
      "Claude and Gemini returned an error for all 13 questions, so this audit's Visibility is based on 2 engines (20 answers).",
    );
  });
});
