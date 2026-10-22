/**
 * "Audits time out on Vercel" follow-up -- the real, current ceiling
 * for a single Vercel serverless function invocation on this
 * project's plan. Vercel's own docs (vercel.com/docs/functions/
 * limitations, "Max duration" table, confirmed 22 Oct 2026): Hobby =
 * 300s default AND maximum, WITH fluid compute -- which Vercel
 * enables by default for new projects, but this project predates
 * that rollout and its Fluid-compute status couldn't be confirmed
 * from here (no Vercel CLI/dashboard access). vercel.json's
 * maxDuration for /api/webhooks/inngest and /api/audits/route.ts is
 * set to this same value -- if a deploy ever rejects 300 as exceeding
 * the real plan ceiling (meaning Fluid compute turned out to be off),
 * that's Vercel's own validation catching it at deploy time, not a
 * silent runtime failure; the fallback is enabling Fluid compute
 * (Settings -> Functions, zero cost on Hobby) or lowering both this
 * constant and vercel.json back to 60 together.
 */
export const VERCEL_FUNCTION_MAX_DURATION_MS = 300_000;

/**
 * 10s of headroom before the hard limit above -- so a step (or, for
 * the inline fallback runner, the whole request) that's right at the
 * edge still has time to finish WRITING its own result (a citation/
 * failure row, or the audit's own failed/complete status) before
 * Vercel kills the invocation, rather than the write itself becoming
 * the thing that gets interrupted.
 */
export const INNGEST_STEP_BUDGET_MS = VERCEL_FUNCTION_MAX_DURATION_MS - 10_000;
