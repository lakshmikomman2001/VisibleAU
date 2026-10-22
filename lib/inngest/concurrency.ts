/**
 * "Inngest: fit within the 5 concurrent steps of the free plan" --
 * production evidence (22 Oct): the Inngest dashboard showed "Runs
 * delayed because your concurrency limit was reached" and "5/5
 * concurrent steps" while ~15 functions all fired off audit.complete
 * at once, competing with run-audit's own call steps for the
 * account's Hobby-plan ceiling (5 total, account-wide, across every
 * function).
 *
 * Every function below is triggered, directly or transitively, by
 * audit.complete (aggregate-visibility-trend, calculate-share-of-
 * voice, calculate-topical-gaps, capture-evidence-snapshot, classify-
 * citation-sources, detect-drift, detect-hallucinations, fanout-
 * webhooks, ga4-push, generate-recommendations, run-comparison-
 * prompts, send-audit-complete-email, simulate-query-fan-out, plus
 * build-citation-source-intelligence (citations/classified) and
 * generate-narrative-report (trend/aggregated)) and shares this ONE
 * pool -- never its own separate, undrained limit -- so none of them
 * can collectively exceed POST_AUDIT_POOL.limit concurrent steps,
 * account-wide, leaving the rest of the account's ceiling for
 * run-audit's own call:<engine>:<promptIndex> steps.
 *
 * Deliberately NOT Inngest's `priority` option: priority only
 * reorders a single function's OWN queued runs against each other
 * (confirmed against Inngest's docs, 22 Oct 2026) -- it has no effect
 * across different functions competing for the same account-wide
 * concurrency slots, which is exactly this problem. A shared,
 * account-scoped concurrency key is what actually throttles a GROUP
 * of different functions together (confirmed directly against the
 * installed inngest@4.5.0 package's own type definitions: scope?:
 * "fn" | "env" | "account" on ConcurrencyOption).
 *
 * The limit is deliberately the SAME constant as run-audit's own
 * ACCOUNT_CONCURRENCY_HEADROOM_SLOTS (lib/audit/concurrency-limit.ts)
 * -- the "1 left for everything else" half of that formula's own
 * reasoning, kept as one tied-together number rather than two
 * independent ones that could silently drift apart.
 */
import { ACCOUNT_CONCURRENCY_HEADROOM_SLOTS } from "@/lib/audit/concurrency-limit";

export const POST_AUDIT_POOL = {
  scope: "account" as const,
  key: '"post-audit-pool"',
  limit: ACCOUNT_CONCURRENCY_HEADROOM_SLOTS,
};
