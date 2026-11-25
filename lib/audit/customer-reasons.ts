import type { EngineFailureReasonKey } from "./engine-failure";

/**
 * S01C part 1 (LLD amendment 58): what a customer is told when an engine failed, stopped or was skipped.
 *
 * Two voices, as for Google's questions (lib/audit/google-surfaces/reasons.ts, the operator settings page's rule
 * "Customers are shown only a plain reason (for example 'a problem on our side')"):
 * - the OPERATOR's: describeEngineFailure's label and check (lib/audit/engine-failure.ts), which name spend limits,
 *   quotas, credit, keys, rate limits and status codes. Operator surfaces only: the operator copy of the
 *   whole-engine failure email, logs and the diag SQL.
 * - the CUSTOMER's: customerEngineReason below, the only engine reason the PDF (every tier, report_v2 off
 *   included), the audit page, the running audit, the client portal, the emails customers get and the exports
 *   carry. Every engine is called on Vunnara's own accounts, so every cause is on our side: spend limits, quotas,
 *   credit, billing, keys, rate limits, provider outages, timeouts and model errors alike. The audit page printed
 *   "Provider spend limit reached (a monthly limit set in the provider's console)" and the real reports "Claude:
 *   provider spend limit reached" under the over-time chart.
 */

/** The plain reason, as it reads inside a sentence: "Claude didn't answer: a problem on our side". */
export const PROBLEM_ON_OUR_SIDE = "a problem on our side";

/**
 * One entry per operator reason, so a new reason can't reach a customer without being given its plain words here.
 * None describes the customer's own setup: those reasons (an unconfirmed business type, the workspace's daily
 * audit limit) stop a whole audit and keep their own wording (lib/costs/customer-safe.ts).
 */
const CUSTOMER_ENGINE_REASONS: Record<EngineFailureReasonKey, string> = {
  spend_limit: PROBLEM_ON_OUR_SIDE,
  search_daily_limit: PROBLEM_ON_OUR_SIDE,
  account_or_credit: PROBLEM_ON_OUR_SIDE,
  authentication: PROBLEM_ON_OUR_SIDE,
  permission: PROBLEM_ON_OUR_SIDE,
  model_not_found: PROBLEM_ON_OUR_SIDE,
  rate_limited: PROBLEM_ON_OUR_SIDE,
  overloaded: PROBLEM_ON_OUR_SIDE,
  timeout: PROBLEM_ON_OUR_SIDE,
  search_tool: PROBLEM_ON_OUR_SIDE,
  empty_response: PROBLEM_ON_OUR_SIDE,
  parse_error: PROBLEM_ON_OUR_SIDE,
  answer_incomplete: PROBLEM_ON_OUR_SIDE,
  provider_filter: PROBLEM_ON_OUR_SIDE,
  request_rejected: PROBLEM_ON_OUR_SIDE,
  provider_server_error: PROBLEM_ON_OUR_SIDE,
  unknown: PROBLEM_ON_OUR_SIDE,
};

/** Why an engine didn't answer, for a customer, in sentence form ("a problem on our side"). */
export function customerEngineReason(reason: { key: EngineFailureReasonKey } | null): string {
  return reason ? CUSTOMER_ENGINE_REASONS[reason.key] : PROBLEM_ON_OUR_SIDE;
}

/** The same reason standing on its own, as a label: "A problem on our side". */
export function customerEngineReasonLabel(reason: { key: EngineFailureReasonKey } | null): string {
  const text = customerEngineReason(reason);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Claude didn't answer: a problem on our side", or "Claude and Gemini didn't answer: …" when they share it (they
 * always do today); one clause per reason otherwise, joined with "; ".
 */
export function customerNoAnswerClause(
  failures: ReadonlyArray<{ name: string; reason: string }>,
): string {
  const byReason = new Map<string, string[]>();
  for (const f of failures) byReason.set(f.reason, [...(byReason.get(f.reason) ?? []), f.name]);
  return [...byReason]
    .map(([reason, names]) => `${nameList(names)} didn't answer: ${reason}`)
    .join("; ");
}

function nameList(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
