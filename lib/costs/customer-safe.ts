import { PROBLEM_ON_OUR_SIDE } from "@/lib/audit/customer-reasons";

/**
 * Part 14 (Sri, 13 Nov): what Vunnara pays its providers -- LLM spend, provider usage, DataForSEO's cost,
 * any per-audit or per-feature cost -- is for operators only, and only on /admin pages (lib/admin/costs.ts).
 * A customer page, export or API response never carries it, not even hidden: a route that sends a stored row
 * as it is drops these columns first (what the customer pays -- their plan and billing -- isn't one of them).
 *
 * tests/unit/costs/no-cost-for-customers.test.ts fails if a customer-facing file names a cost field, and the
 * API test checks the responses themselves.
 */

/** Every stored column that holds what a call, an audit or a feature cost us (camelCase, as Drizzle reads it). */
export const COST_COLUMNS = [
  "totalCostUsd",
  "estimatedCostCents",
  "actualCostCents",
  "llmCostUsd",
  "llmCostSource",
  "costUsd",
  "costSource",
  "costEstimateUsd",
  "maxEstimatedCostCents",
] as const;

type CostColumn = (typeof COST_COLUMNS)[number];

/** The row without its cost columns, for a customer response that sends stored rows as they are. */
export function withoutCostColumns<T extends object>(row: T): Omit<T, CostColumn> {
  const copy = { ...row } as Record<string, unknown>;
  for (const key of COST_COLUMNS) delete copy[key];
  return copy as Omit<T, CostColumn>;
}

/**
 * The daily spending limit's own message carries what the workspace's calls cost us today
 * ("A$4.20 of A$5.00"); the customer is told only that the limit is reached and when audits resume.
 */
export const DAILY_LIMIT_CUSTOMER_MESSAGE =
  "Today's audit limit for this workspace is reached. Audits resume after midnight (Sydney time).";

/**
 * S02 part 0B (LLD amendment 71): a whole audit that couldn't finish for a reason on our side -- a budget estimate, a
 * time-out, the question generator, a runner that found no questions or no engines, an unexpected exception.
 */
export const AUDIT_PROBLEM_ON_OUR_SIDE = `This audit couldn't finish because of ${PROBLEM_ON_OUR_SIDE}.`;

/** The unconfirmed-business reason (lib/audit/get-audit-prompts.ts BrandNeedsConfirmationError), the customer's own. */
const CONFIRM_BUSINESS_REASON =
  "Confirm your business type and location on the brand's page before running an audit.";

/**
 * A failed audit's stored error, as a customer may read it. S02 part 0B (LLD amendment 71): only the reasons about
 * the customer's own setup keep their words -- an unconfirmed business type, and the workspace's daily limit (an
 * audit stopped by it stored the limit's amounts, before 13 Nov in the message itself, so it reads the customer
 * wording); every other stored error, whatever it says ("Budget exceeded", "Timed out", an exception's message),
 * reads "This audit couldn't finish because of a problem on our side." Null when nothing is stored.
 */
export function customerAuditError(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const { error, errorCode } = metadata as { error?: unknown; errorCode?: unknown };
  if (errorCode === "DailySpendCapExceededError") return DAILY_LIMIT_CUSTOMER_MESSAGE;
  if (errorCode === "BrandNeedsConfirmationError") return CONFIRM_BUSINESS_REASON;
  if (typeof error !== "string") return errorCode ? AUDIT_PROBLEM_ON_OUR_SIDE : null;
  if (/^Daily spending limit reached/.test(error)) return DAILY_LIMIT_CUSTOMER_MESSAGE;
  if (error === CONFIRM_BUSINESS_REASON) return CONFIRM_BUSINESS_REASON;
  return AUDIT_PROBLEM_ON_OUR_SIDE;
}

/** The audit's metadata as a customer response may carry it: the failure reason in customer wording. */
export function customerAuditMetadata(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== "object") return metadata;
  const error = customerAuditError(metadata);
  return error === null ? metadata : { ...(metadata as Record<string, unknown>), error };
}
