/**
 * Engine-failure follow-ups (1 Nov), item 1 -- the message patterns that
 * name a failed provider call's cause. ONE list, used by:
 * - lib/audit/engine-failure.ts: the reason a page or an email shows;
 * - lib/llm/classify-error.ts: a spend limit isn't retried, nor a 429
 *   that says the account is out of credit or quota (creditOrQuota);
 * - the diag SQL (db/prod-fixes/diag-0108's message_category), which
 *   tests/unit/llm/failure-patterns.test.ts checks carries exactly these.
 *
 * Each is a regex source that JavaScript and PostgreSQL's `~*` read the
 * same way: alternation, groups, [..] and [^..] classes, ^, ? and * only
 * -- no \b, lookarounds, escapes or quotes. Matched case-insensitively.
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

/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 2 -- Google's daily limit on grounded Gemini requests:
 * "a default limit of 1,500 requests per day (RPD) per project on Gemini 3 and newer models"
 * (aistudio.google.com/docs/google-search), reset "at midnight Pacific time" (aistudio.google.com/docs/
 * rate-limits), both checked 7 Nov 2026. Google documents neither the error nor the quota's name. Its 429
 * RESOURCE_EXHAUSTED names the quota it hit -- "* Quota exceeded for metric: <metric>, limit: <n>, model:
 * <model>", or in the older form "Quota exceeded for quota metric '<name>' and limit '<name>'" -- so this is
 * a quota metric that names grounding or search. Checked straight after a spend limit, before a 429's
 * rate-limit type: it comes with the same RESOURCE_EXHAUSTED and the same "check your plan and billing
 * details" sentence as a per-minute limit. Never retried (lib/llm/classify-error.ts). A 429 that names no
 * such quota stays a rate limit, retried as before.
 */
const DAILY_SEARCH_LIMIT = ["quota exceeded for (quota )?metric[^,]*(grounding|search)"];

/** Out of credit or over a quota: Anthropic "Your credit balance is too
 * low" / 402 billing_error, OpenAI insufficient_quota and
 * credit_balance_exhausted, Google payment_required. On a 429 the retry
 * classifier reads these against the provider's own type and code first,
 * and against the message only when there's neither: OpenAI's
 * insufficient_quota message ("You exceeded your current quota, please
 * check your plan and billing details") is the same sentence Gemini
 * sends with an ordinary per-minute rate limit. */
const CREDIT_OR_QUOTA = [
  "credit[_ ]balance",
  "billing",
  "purchase credits",
  "insufficient[_ ]quota",
  "exceeded your current quota",
  "payment[_ ]required",
  "out of credits",
];

/**
 * A 429's rate-limit type or code (2 Nov, Sri's decision): Google's status
 * RESOURCE_EXHAUSTED ("You've exceeded the rate limit", ai.google.dev/
 * gemini-api/docs/troubleshooting), OpenAI's code rate_limit_exceeded and
 * slow_down, Anthropic's type rate_limit_error. Gemini's per-minute limit
 * says "You exceeded your current quota, please check your plan and billing
 * details", and OpenAI's rate limit can link to its billing page -- so on a
 * 429 the type decides before the message's credit/quota words.
 */
const RATE_LIMIT_TYPES = [
  "resource[_ ]exhausted",
  "rate[_ ]?limit",
  "slow[_ ]?down",
  "too[_ ]many[_ ]requests",
];

/**
 * Patterns read only from a 429's own type and code, as lib/llm/
 * with-retry.ts stores them at the start of the message: "HTTP 429
 * <type> (<code>): <the provider's sentence>" (the type since 217cce7, 31
 * Oct; the code since 4c9e2bc, 1 Nov). [^:]* stops at that first colon, so
 * the provider's sentence can't match. A row stored without the prefix --
 * before 31 Oct, or a 429 whose body wasn't parsed ("HTTP 429: ...") --
 * doesn't match these, and is read by the message patterns as before.
 */
function on429Type(types: readonly string[]): string {
  return `^HTTP 429 [^:]*(${types.join("|")})`;
}

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

/**
 * "Mention detection" (6 Nov), part 2 -- the app's own messages for an answer the provider didn't finish
 * (lib/llm/stop-reason.ts): Claude's turn still paused (pause_turn) after it was sent back to carry on, or
 * continuing it failed; and a provider's own filter stopping the answer (Gemini RECITATION / SAFETY, OpenAI
 * content_filter, Claude refusal). Checked last: when continuing failed for a reason the categories above
 * name (a spend limit, say), that reason decides.
 */
const ANSWER_INCOMPLETE = ["answer incomplete"];
const PROVIDER_FILTER = ["provider stopped the answer"];

/**
 * Each category as one regex source ("a|b|c"), in the order they're
 * checked: a spend limit first; then Gemini's daily search limit (7 Nov);
 * then a 429's own type or code -- out of quota (OpenAI's
 * insufficient_quota, as lib/llm/classify-error.ts reads it), then a rate
 * limit (2 Nov); only then the message's own words.
 */
export const FAILURE_PATTERNS = {
  spendLimit: SPEND_LIMIT.join("|"),
  dailySearchLimit: DAILY_SEARCH_LIMIT.join("|"),
  quotaOn429: on429Type(CREDIT_OR_QUOTA),
  rateLimitOn429: on429Type(RATE_LIMIT_TYPES),
  creditOrQuota: CREDIT_OR_QUOTA.join("|"),
  authentication: AUTHENTICATION.join("|"),
  permission: PERMISSION.join("|"),
  modelNotFound: MODEL_NOT_FOUND.join("|"),
  answerIncomplete: ANSWER_INCOMPLETE.join("|"),
  providerFilter: PROVIDER_FILTER.join("|"),
} as const;

export type FailurePatternKey = keyof typeof FAILURE_PATTERNS;

/** The categories in the order they're checked. */
export const FAILURE_PATTERN_ORDER = Object.keys(FAILURE_PATTERNS) as FailurePatternKey[];

/** The same category's label in the diag SQL's message_category column. */
export const FAILURE_PATTERN_SQL_CATEGORIES: Record<FailurePatternKey, string> = {
  spendLimit: "provider spend limit reached",
  dailySearchLimit: "provider daily search limit reached",
  quotaOn429: "account / credit / quota (429 type)",
  rateLimitOn429: "provider rate limit (429 type)",
  creditOrQuota: "account / credit / quota",
  authentication: "API key / authentication",
  permission: "permission",
  modelNotFound: "model not found / retired",
  answerIncomplete: "answer incomplete",
  providerFilter: "provider stopped the answer (safety or recitation filter)",
};

const COMPILED = Object.fromEntries(
  Object.entries(FAILURE_PATTERNS).map(([key, source]) => [key, new RegExp(source, "i")]),
) as Record<FailurePatternKey, RegExp>;

/** Whether a failure message matches a category's patterns. */
export function matchesFailurePattern(key: FailurePatternKey, message: string): boolean {
  return COMPILED[key].test(message);
}

/** The first category a stored failure message matches, in FAILURE_PATTERNS's order; null for none. */
export function failureMessageCategory(message: string): FailurePatternKey | null {
  return FAILURE_PATTERN_ORDER.find((key) => COMPILED[key].test(message)) ?? null;
}

/**
 * What the diag reads from the message where the app reads error_class or
 * the HTTP status instead (lib/audit/engine-failure.ts) -- SQL only,
 * checked after the shared categories.
 */
const SQL_ONLY_CATEGORIES: ReadonlyArray<readonly [pattern: string, label: string]> = [
  ["overloaded", "overloaded"],
  ["rate[ _]?limit|too many requests", "rate limited"],
  ["timed? ?out|aborted", "timed out"],
  ["prompt is too long|too large|context length|max_tokens", "request too large"],
];

/**
 * diag-0108's message_category CASE, generated from the categories above in
 * their order, then the SQL-only ones. The SQL file can't import this (it's
 * pasted into the Neon editor): tests/unit/llm/failure-patterns.test.ts
 * checks the file carries exactly this text, so change the patterns here
 * and paste the output there.
 */
export function failureCategorySqlCase(column: string): string {
  return [
    "CASE",
    ...FAILURE_PATTERN_ORDER.flatMap((key) => [
      `  WHEN ${column} ~* '${FAILURE_PATTERNS[key]}'`,
      `    THEN '${FAILURE_PATTERN_SQL_CATEGORIES[key]}'`,
    ]),
    ...SQL_ONLY_CATEGORIES.map(
      ([pattern, label]) => `  WHEN ${column} ~* '${pattern}' THEN '${label}'`,
    ),
    `  WHEN ${column} IS NULL THEN 'no message'`,
    "  ELSE 'not recognised'",
    "END",
  ].join("\n");
}
