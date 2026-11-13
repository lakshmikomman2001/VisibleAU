import type { GoogleOutcome } from "@/lib/audit/google-surfaces/summary";
import {
  dataForSeoErrorCategory,
  GOOGLE_PROVIDER_ERROR_LABELS,
  type GoogleProviderErrorCategory,
} from "@/lib/serp/dataforseo-errors";

/**
 * Google AI follow-ups (12 Nov), part 2 -- why a Google question wasn't checked, in two voices.
 *
 * - The OPERATOR's: what's stored in google_surface_results.outcome_reason (with provider_status_code and,
 *   for a failed task, the provider's full response). It can name codes, env vars and the provider's own
 *   message ("40100 You are not authorized ... https://app.dataforseo.com/api-access"), and it's shown only
 *   on /admin/settings, to an operator.
 * - The CUSTOMER's: googleCustomerReason() below, the only reason the audit page, the PDFs, the email, the
 *   client portal and the API show. It's chosen from the stored fields, never copied from them, so a
 *   provider's raw message, a code or a provider URL can't reach a customer -- an unknown stored reason
 *   gets the plain "This question wasn't checked this time."
 */

/** The reasons Vunnara itself stores (operator-facing; the customer is shown googleCustomerReason's). */
export const GOOGLE_STORED_REASON = {
  switchedOff: "Skipped: Google was switched off (GOOGLE_AI_SURFACES_ENABLED) during the audit.",
  noCredentials: "Skipped: the provider's credentials aren't set.",
  dailyCap:
    "Skipped: today's spend limit. Google is skipped first so the four engines can still run.",
  costCeilingPrefix: "Skipped: the cost limit for Google",
  costCeiling: (usd: number) =>
    `Skipped: the cost limit for Google (US$${usd.toFixed(usd < 0.01 ? 4 : 2)} per audit) was reached.`,
  notCompleted: "Not completed: Google hadn't answered within 15 minutes.",
  functionFailed: "Not completed: Google couldn't be checked for this audit.",
  noQuestions: "The audit had no questions.",
  runnerUnreachable: "Google couldn't be checked: the background runner wasn't reachable.",
  /** Part 3: the questions not sent after the provider refused the account. */
  stoppedPrefix: "Not sent: the provider answered",
  stopped: (code: number, category: GoogleProviderErrorCategory) =>
    `Not sent: the provider answered ${code} (${GOOGLE_PROVIDER_ERROR_LABELS[category]}) earlier in this audit, so the rest weren't sent.`,
} as const;

const PROBLEM_ON_OUR_SIDE =
  "Google couldn't be checked this time because of a problem on our side. It will be checked again on the next audit.";

/** What a customer is told for each category (12 Nov; no codes, no provider names or URLs). */
export const GOOGLE_CUSTOMER_REASONS: Record<GoogleProviderErrorCategory, string> = {
  login_rejected: PROBLEM_ON_OUR_SIDE,
  out_of_credit: PROBLEM_ON_OUR_SIDE,
  rate_limited:
    "Google couldn't be checked this time because the checking service was busy. It will be checked again on the next audit.",
  location_or_language:
    "Google couldn't be checked this time: the checking service doesn't support this location or language.",
  timeout: "Google didn't answer in time. It will be checked again on the next audit.",
  other:
    "Google couldn't be checked this time because of a problem with the checking service. It will be checked again on the next audit.",
};

export const GOOGLE_CUSTOMER_OWN_REASONS = {
  notConfigured: PROBLEM_ON_OUR_SIDE,
  switchedOff:
    "Google was switched off during this audit, so the rest of its questions weren't checked.",
  costCeiling:
    "This audit reached its cost limit for Google, so the rest of its questions weren't checked.",
  dailyCap:
    "Today's spending limit was reached, so Google was skipped to leave room for the four AI engines.",
  notChecked: "This question wasn't checked this time.",
} as const;

export interface StoredGoogleReason {
  outcome: GoogleOutcome;
  providerStatusCode: number | null;
  outcomeReason: string | null;
}

/** The category a failed or stopped question's provider code falls in, or null when the provider wasn't at fault. */
export function googleRowErrorCategory(
  row: StoredGoogleReason,
): GoogleProviderErrorCategory | null {
  if (row.outcome === "failed") return dataForSeoErrorCategory(row.providerStatusCode);
  if (row.outcome === "not_completed") {
    if (row.providerStatusCode) return dataForSeoErrorCategory(row.providerStatusCode);
    if (row.outcomeReason === GOOGLE_STORED_REASON.notCompleted) return "timeout";
  }
  return null;
}

/** Why a question wasn't checked, for a customer; null for one that was (or is still waiting). */
export function googleCustomerReason(row: StoredGoogleReason): string | null {
  if (row.outcome === "shown" || row.outcome === "not_shown" || row.outcome === "pending") {
    return null;
  }
  const category = googleRowErrorCategory(row);
  if (category) return GOOGLE_CUSTOMER_REASONS[category];
  const stored = row.outcomeReason ?? "";
  if (stored === GOOGLE_STORED_REASON.switchedOff) return GOOGLE_CUSTOMER_OWN_REASONS.switchedOff;
  if (stored === GOOGLE_STORED_REASON.noCredentials)
    return GOOGLE_CUSTOMER_OWN_REASONS.notConfigured;
  if (stored === GOOGLE_STORED_REASON.dailyCap) return GOOGLE_CUSTOMER_OWN_REASONS.dailyCap;
  if (stored.startsWith(GOOGLE_STORED_REASON.costCeilingPrefix)) {
    return GOOGLE_CUSTOMER_OWN_REASONS.costCeiling;
  }
  if (
    stored === GOOGLE_STORED_REASON.runnerUnreachable ||
    stored === GOOGLE_STORED_REASON.functionFailed
  ) {
    return PROBLEM_ON_OUR_SIDE;
  }
  return GOOGLE_CUSTOMER_OWN_REASONS.notChecked;
}

/** The location resolver's reasons a customer can be shown as they are (lib/google-surfaces/location.ts). */
const CUSTOMER_SAFE_STATUS = [
  /^An online-only business has no suburb to locate Google results at\.$/,
  /^The provider has no Google location for [A-Z]{2,3}\.$/,
];

/**
 * Why Google wasn't checked for a whole audit, for a customer. The resolver's "no state" reason tells the
 * operator where to fix it; the customer gets the sentence without the admin page.
 */
export function googleCustomerStatusReason(statusReason: string | null): string | null {
  if (!statusReason) return null;
  if (CUSTOMER_SAFE_STATUS.some((re) => re.test(statusReason))) {
    return statusReason.replace(/^The provider has/, "The checking service has");
  }
  if (statusReason.startsWith("The business has no state")) {
    return "The business has no state, so there's no Google location for it.";
  }
  if (statusReason === GOOGLE_STORED_REASON.noQuestions) return statusReason;
  if (statusReason === GOOGLE_STORED_REASON.runnerUnreachable) return PROBLEM_ON_OUR_SIDE;
  // Unknown: no reason ("Google couldn't be checked for this audit.") rather than an unvetted one.
  return null;
}
