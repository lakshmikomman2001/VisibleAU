/**
 * Failed-call rows as engine_call_failures stores them (error_class and
 * error_message, written by lib/llm/with-retry.ts: "HTTP <status> <type>
 * (<code>): <the provider's sentence>" since 31 Oct, the bare sentence
 * before), with the reason the app should give each and the shared
 * pattern category (lib/llm/failure-patterns.ts) that decides it -- for
 * the label tests and the TypeScript-vs-SQL parity test.
 */
import type { EngineFailureReasonKey } from "@/lib/audit/engine-failure";
import type { FailurePatternKey } from "@/lib/llm/failure-patterns";
import {
  continuationFailedMessage,
  pausedAnswerMessage,
  providerFilterMessage,
} from "@/lib/llm/stop-reason";

/** Gemini's 429 RESOURCE_EXHAUSTED sentence -- for a per-minute rate limit too. */
export const GEMINI_RATE_LIMIT_SENTENCE =
  "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.";
/** OpenAI's insufficient_quota sentence. */
export const OPENAI_OUT_OF_QUOTA_SENTENCE =
  "You exceeded your current quota, please check your plan and billing details.";
/** An OpenAI rate limit that links to the billing page. */
export const OPENAI_RATE_LIMIT_BILLING_SENTENCE =
  "Rate limit reached for gpt-4o-mini on tokens per min (TPM): Limit 200000, Used 199000, Requested 1500. Please try again in 450ms. Visit https://platform.openai.com/account/rate-limits to learn more. You can increase your rate limit by adding a payment method to your account at https://platform.openai.com/account/billing.";
const ANTHROPIC_CREDIT =
  "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";
const ANTHROPIC_USAGE_LIMIT =
  "You have reached your specified API usage limits. You will regain access on Nov 1, 2026 at 00:00 UTC.";

export interface FailureMessageSample {
  name: string;
  errorClass: string;
  message: string | null;
  reason: EngineFailureReasonKey;
  /** The shared pattern category; null when none matches (the app then reads the status or error_class). */
  category: FailurePatternKey | null;
}

export const FAILURE_MESSAGE_SAMPLES: FailureMessageSample[] = [
  // 2 Nov: a 429's own type or code decides before the message's words.
  {
    name: "Gemini 429 RESOURCE_EXHAUSTED, 'check your plan and billing details'",
    errorClass: "rate_limited",
    message: `HTTP 429 RESOURCE_EXHAUSTED: ${GEMINI_RATE_LIMIT_SENTENCE}`,
    reason: "rate_limited",
    category: "rateLimitOn429",
  },
  // Methodology v2.2 (7 Nov), part 2: Gemini's 429 names the quota it hit. Google hasn't published the
  // grounding quota's metric name; this stand-in names grounding, as a per-day search quota would.
  {
    name: "Gemini 429 naming a grounding quota: the daily search limit, not a rate limit",
    errorClass: "rate_limited",
    message: `HTTP 429 RESOURCE_EXHAUSTED: ${GEMINI_RATE_LIMIT_SENTENCE}\n* Quota exceeded for metric: generativelanguage.googleapis.com/grounding_with_google_search_requests, limit: 1500, model: gemini-3.5-flash-lite\nPlease retry in 9h41m2s.`,
    reason: "search_daily_limit",
    category: "dailySearchLimit",
  },
  {
    name: "Gemini 429 in the older form, 'Quota exceeded for quota metric' naming search",
    errorClass: "rate_limited",
    message:
      "HTTP 429 RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'Grounding with Google Search requests' and limit 'Grounding with Google Search requests per day per project' of service 'generativelanguage.googleapis.com'.",
    reason: "search_daily_limit",
    category: "dailySearchLimit",
  },
  {
    name: "Gemini 429 naming a per-minute generate_content quota: still a rate limit",
    errorClass: "rate_limited",
    message: `HTTP 429 RESOURCE_EXHAUSTED: ${GEMINI_RATE_LIMIT_SENTENCE}\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_paid_tier_requests, limit: 4000, model: gemini-3.5-flash-lite\nPlease retry in 1.5s.`,
    reason: "rate_limited",
    category: "rateLimitOn429",
  },
  {
    name: "OpenAI 429 rate_limit_exceeded whose message links to billing",
    errorClass: "rate_limited",
    message: `HTTP 429 tokens (rate_limit_exceeded): ${OPENAI_RATE_LIMIT_BILLING_SENTENCE}`,
    reason: "rate_limited",
    category: "rateLimitOn429",
  },
  {
    name: "OpenAI 429 rate_limit_exceeded",
    errorClass: "rate_limited",
    message:
      "HTTP 429 requests (rate_limit_exceeded): Rate limit reached for gpt-4o-mini on requests per min (RPM): Limit 500, Used 500, Requested 1.",
    reason: "rate_limited",
    category: "rateLimitOn429",
  },
  {
    name: "OpenAI 429 slow_down",
    errorClass: "rate_limited",
    message: "HTTP 429 rate_limit_error (slow_down): Please slow down.",
    reason: "rate_limited",
    category: "rateLimitOn429",
  },
  {
    name: "Anthropic 429 rate_limit_error",
    errorClass: "rate_limited",
    message:
      "HTTP 429 rate_limit_error: This request would exceed the rate limit for your organization of 50,000 input tokens per minute.",
    reason: "rate_limited",
    category: "rateLimitOn429",
  },
  {
    name: "OpenAI 429 insufficient_quota (not retried, a130b31)",
    errorClass: "other",
    message: `HTTP 429 insufficient_quota: ${OPENAI_OUT_OF_QUOTA_SENTENCE}`,
    reason: "account_or_credit",
    category: "quotaOn429",
  },
  {
    name: "OpenAI 429 insufficient_quota (credit_balance_exhausted)",
    errorClass: "other",
    message: "HTTP 429 insufficient_quota (credit_balance_exhausted): No credits remaining.",
    reason: "account_or_credit",
    category: "quotaOn429",
  },
  // A spend limit stays first.
  {
    name: "OpenAI 429 organization_spend_limit_exceeded",
    errorClass: "other",
    message: "HTTP 429 insufficient_quota (organization_spend_limit_exceeded): Request refused.",
    reason: "spend_limit",
    category: "spendLimit",
  },
  {
    name: "Anthropic's tier cap: 429 rate_limit_error (enforced_spend_limit_reached)",
    errorClass: "other",
    message:
      "HTTP 429 rate_limit_error (enforced_spend_limit_reached): You have reached your API usage limits: your organization has crossed its monthly API usage threshold.",
    reason: "spend_limit",
    category: "spendLimit",
  },
  {
    name: "Anthropic 400 spend limit (audit #37)",
    errorClass: "other",
    message: `HTTP 400 invalid_request_error: ${ANTHROPIC_USAGE_LIMIT}`,
    reason: "spend_limit",
    category: "spendLimit",
  },
  {
    name: "Anthropic spend limit, stored before 31 Oct (no prefix)",
    errorClass: "other",
    message: ANTHROPIC_USAGE_LIMIT,
    reason: "spend_limit",
    category: "spendLimit",
  },
  // The message's words, as before.
  {
    name: "Anthropic 400 credit balance too low",
    errorClass: "other",
    message: `HTTP 400 invalid_request_error: ${ANTHROPIC_CREDIT}`,
    reason: "account_or_credit",
    category: "creditOrQuota",
  },
  {
    name: "Anthropic credit balance, stored before 31 Oct (no prefix)",
    errorClass: "other",
    message: ANTHROPIC_CREDIT,
    reason: "account_or_credit",
    category: "creditOrQuota",
  },
  {
    name: "a Gemini rate limit stored before 31 Oct (no prefix): left as it was, read by its words",
    errorClass: "rate_limited",
    message: GEMINI_RATE_LIMIT_SENTENCE,
    reason: "account_or_credit",
    category: "creditOrQuota",
  },
  {
    name: "a 429 stored without its type (body not parsed): read by its words",
    errorClass: "other",
    message: `HTTP 429: ${OPENAI_OUT_OF_QUOTA_SENTENCE}`,
    reason: "account_or_credit",
    category: "creditOrQuota",
  },
  {
    name: "Gemini 402 depleted Prepay credits",
    errorClass: "other",
    message: "HTTP 402: Payment required.",
    reason: "account_or_credit",
    category: "creditOrQuota",
  },
  {
    name: "Perplexity 429 (no type): its error class",
    errorClass: "rate_limited",
    message: "HTTP 429: Perplexity API 429: Rate limit exceeded, please retry later",
    reason: "rate_limited",
    category: null,
  },
  {
    name: "401 bad key",
    errorClass: "other",
    message: "HTTP 401 authentication_error: invalid x-api-key",
    reason: "authentication",
    category: "authentication",
  },
  {
    name: "403 permission",
    errorClass: "other",
    message: "HTTP 403 permission_error: not allowed",
    reason: "permission",
    category: "permission",
  },
  {
    name: "404 retired model",
    errorClass: "other",
    message: "HTTP 404 not_found_error: model: claude-x",
    reason: "model_not_found",
    category: "modelNotFound",
  },
  {
    name: "529 overloaded",
    errorClass: "overloaded",
    message: "HTTP 529 overloaded_error: Overloaded",
    reason: "overloaded",
    category: null,
  },
  {
    name: "a timeout",
    errorClass: "timeout",
    message: "The operation was aborted",
    reason: "timeout",
    category: null,
  },
  {
    name: "no message",
    errorClass: "timeout",
    message: null,
    reason: "timeout",
    category: null,
  },
  // "Mention detection" (6 Nov), part 2: an answer the provider didn't finish.
  {
    name: "Claude's turn still paused after it was sent back 3 times",
    errorClass: "incomplete_answer",
    message: pausedAnswerMessage(4),
    reason: "answer_incomplete",
    category: "answerIncomplete",
  },
  {
    name: "continuing Claude's paused turn hit the spend limit: the spend limit is the reason",
    errorClass: "incomplete_answer",
    message: continuationFailedMessage(`HTTP 400 invalid_request_error: ${ANTHROPIC_USAGE_LIMIT}`),
    reason: "spend_limit",
    category: "spendLimit",
  },
  {
    name: "Gemini RECITATION",
    errorClass: "incomplete_answer",
    message: providerFilterMessage("RECITATION"),
    reason: "provider_filter",
    category: "providerFilter",
  },
  {
    name: "OpenAI content_filter",
    errorClass: "incomplete_answer",
    message: providerFilterMessage("content_filter"),
    reason: "provider_filter",
    category: "providerFilter",
  },
];
