/**
 * Google AI follow-ups (12 Nov), part 2 -- DataForSEO's status codes in a few plain categories, so an
 * operator knows what went wrong and a customer is told only what it means for them. Every code here is in
 * DataForSEO's errors appendix (https://docs.dataforseo.com/v3/appendix/errors/, read 12 Nov 2026), with its
 * published message; a code that isn't listed is "other". Nothing is inferred from a message's wording.
 *
 * - login rejected: the account was refused, so every other request will be refused too --
 *   40100 "you are not authorized to access this resource" (audit #44, 12 Nov: all 26 tasks),
 *   40104 "please verify your account before using the api",
 *   40201 "we noticed some unusual activity in your dataforseo account",
 *   40204 "Access denied. Visit Plans and Subscriptions to activate your subscription",
 *   40207 "access denied. your ip is not whitelisted",
 *   40208 the blocked-country message;
 * - out of credit: 40200 "payment required", 40203 "the cost limit has been exceeded" (the account's own
 *   limit, set at DataForSEO), 40210 "insufficient funds. your account's balance is too low";
 * - rate limited: 40202 "the rate-limit per minute has been exceeded", 40205 / 40206 the duplicate task
 *   limits per hour and per day, 40209 "too many simultaneous queries";
 * - location or language not supported: 40505 "You are using old data." ("location parameters you are using
 *   are outdated"). The appendix has no other location or language code; 40501 "invalid field." could be any
 *   field, so it stays "other";
 * - timed out: 50401 "internal error - timeout.", 50402 "target page took too long to respond.", and no
 *   answer from the provider at all (the request timed out or couldn't connect: no status code, stored as
 *   null);
 * - other: everything else (40101 "internal se server error.", 40102 "no search results.", 40501, 50000 ...).
 */

export const GOOGLE_PROVIDER_ERROR_CATEGORIES = [
  "login_rejected",
  "out_of_credit",
  "rate_limited",
  "location_or_language",
  "timeout",
  "other",
] as const;
export type GoogleProviderErrorCategory = (typeof GOOGLE_PROVIDER_ERROR_CATEGORIES)[number];

export const DATAFORSEO_CATEGORY_CODES: Record<
  Exclude<GoogleProviderErrorCategory, "other">,
  readonly number[]
> = {
  login_rejected: [40100, 40104, 40201, 40204, 40207, 40208],
  out_of_credit: [40200, 40203, 40210],
  rate_limited: [40202, 40205, 40206, 40209],
  location_or_language: [40505],
  timeout: [50401, 50402],
};

/** No answer from the provider (timed out, couldn't connect, not its JSON): there's no status code. */
export const NO_PROVIDER_ANSWER = 0;

/** A DataForSEO status code's category; null or 0 = the provider didn't answer. */
export function dataForSeoErrorCategory(
  statusCode: number | null | undefined,
): GoogleProviderErrorCategory {
  if (statusCode === null || statusCode === undefined || statusCode === NO_PROVIDER_ANSWER) {
    return "timeout";
  }
  for (const [category, codes] of Object.entries(DATAFORSEO_CATEGORY_CODES)) {
    if (codes.includes(statusCode)) return category as GoogleProviderErrorCategory;
  }
  return "other";
}

/** Login rejected or out of credit: every other request in the audit would fail the same way. */
export function stopsTheRun(category: GoogleProviderErrorCategory): boolean {
  return category === "login_rejected" || category === "out_of_credit";
}

/** What the operator's page and alert call each category. */
export const GOOGLE_PROVIDER_ERROR_LABELS: Record<GoogleProviderErrorCategory, string> = {
  login_rejected: "login rejected",
  out_of_credit: "out of credit",
  rate_limited: "rate limited",
  location_or_language: "location or language not supported",
  timeout: "timed out",
  other: "provider error",
};
