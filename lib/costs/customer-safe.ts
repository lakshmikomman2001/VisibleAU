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
 * A failed audit's stored error, as a customer may read it. An audit stopped by the daily spending limit
 * stored the limit's amounts (before 13 Nov in the message itself); those audits read the customer wording.
 */
export function customerAuditError(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const { error, errorCode } = metadata as { error?: unknown; errorCode?: unknown };
  if (errorCode === "DailySpendCapExceededError") return DAILY_LIMIT_CUSTOMER_MESSAGE;
  if (typeof error !== "string") return null;
  if (/^Daily spending limit reached/.test(error)) return DAILY_LIMIT_CUSTOMER_MESSAGE;
  return error;
}

/** The audit's metadata as a customer response may carry it: the failure reason in customer wording. */
export function customerAuditMetadata(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== "object") return metadata;
  const error = customerAuditError(metadata);
  return error === null ? metadata : { ...(metadata as Record<string, unknown>), error };
}
