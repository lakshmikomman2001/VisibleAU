/**
 * Engine-failure follow-ups (1 Nov), item 1 -- the message patterns that
 * name a failed provider call's cause. ONE list, used by:
 * - lib/audit/engine-failure.ts: the reason a page or an email shows;
 * - lib/llm/classify-error.ts: a spend limit isn't retried;
 * - the diag SQL (db/prod-fixes/diag-0108's message_category), which
 *   tests/unit/llm/failure-patterns.test.ts checks carries exactly these.
 *
 * Each is a regex source that JavaScript and PostgreSQL's `~*` read the
 * same way: alternation, groups, [..] classes, ? and .* only -- no \b,
 * lookarounds, escapes or quotes. Matched case-insensitively.
 */

/**
 * A spend limit, which no retry gets past. Checked before creditOrQuota:
 * audit #37's account still had credit, but had reached the monthly
 * limit set in Anthropic's console. Sources (1 Nov 2026):
 * - Anthropic, platform.claude.com/docs/en/api/rate-limits: a spend limit
 *   you set returns 400 invalid_request_error, "You have reached your
 *   specified API usage limits" ("...specified workspace API usage
 *   limits" for a workspace limit). The usage tier's own monthly cap
 *   returns 429 rate_limit_error, "You have reached your API usage
 *   limits: ...", error.details.error_code "enforced_spend_limit_reached",
 *   with no retry-after.
 * - OpenAI, developers.openai.com/api/docs/guides/error-codes: 429 with
 *   code organization_spend_limit_exceeded, project_spend_limit_exceeded
 *   or organization_usage_limit_exceeded ("Retrying billing, spend, or
 *   quota errors won't restore API access").
 * - Google, ai.google.dev/gemini-api/docs/api-errors: no spend-limit error
 *   is documented; the generic phrases cover one if it appears.
 */
const SPEND_LIMIT = [
  "specified (workspace )?api usage limits",
  "reached your api usage limits",
  "enforced_spend_limit",
  "spend(ing)?[_ ]limit",
  "spend(ing)?[_ ]cap",
  "usage[_ ]limit",
  "monthly (spend(ing)? )?limit",
  "hard[_ ]limit",
];

/** Out of credit or over a quota: Anthropic "Your credit balance is too
 * low" / 402 billing_error, OpenAI insufficient_quota and
 * credit_balance_exhausted, Google payment_required. */
const CREDIT_OR_QUOTA = [
  "credit[_ ]balance",
  "billing",
  "purchase credits",
  "insufficient[_ ]quota",
  "exceeded your current quota",
  "payment[_ ]required",
  "out of credits",
];

const AUTHENTICATION = [
  "invalid[_ ]?(x-)?api[_ -]?key",
  "incorrect api key",
  "api key not valid",
  "api key is missing",
  "not configured",
  "authentication",
  "unauthori[sz]ed",
];

const PERMISSION = ["permission", "forbidden", "not allowed", "access denied"];

const MODEL_NOT_FOUND = [
  "not_found_error",
  "model_not_found",
  "model.*(not found|does not exist)",
  "deprecated",
  "no longer (available|supported)",
];

/** Each category as one regex source ("a|b|c"), in the order they're checked. */
export const FAILURE_PATTERNS = {
  spendLimit: SPEND_LIMIT.join("|"),
  creditOrQuota: CREDIT_OR_QUOTA.join("|"),
  authentication: AUTHENTICATION.join("|"),
  permission: PERMISSION.join("|"),
  modelNotFound: MODEL_NOT_FOUND.join("|"),
} as const;

export type FailurePatternKey = keyof typeof FAILURE_PATTERNS;

/** The same category's label in the diag SQL's message_category column. */
export const FAILURE_PATTERN_SQL_CATEGORIES: Record<FailurePatternKey, string> = {
  spendLimit: "provider spend limit reached",
  creditOrQuota: "account / credit / quota",
  authentication: "API key / authentication",
  permission: "permission",
  modelNotFound: "model not found / retired",
};

const COMPILED = Object.fromEntries(
  Object.entries(FAILURE_PATTERNS).map(([key, source]) => [key, new RegExp(source, "i")]),
) as Record<FailurePatternKey, RegExp>;

/** Whether a failure message matches a category's patterns. */
export function matchesFailurePattern(key: FailurePatternKey, message: string): boolean {
  return COMPILED[key].test(message);
}
