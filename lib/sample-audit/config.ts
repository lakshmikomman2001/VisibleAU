/**
 * Vunnara (sample-audit follow-up, 20 Oct, post-21bcd79) -- the headline
 * threshold (MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE, lib/scoring/dimension-
 * result.ts) was raised from 1 to 10 and flagged a confirmed conflict:
 * this config declared 1 engine x 5 prompts = 5 total organic answers,
 * always below 10. Sri's decision (option A): raise the sample instead
 * of lowering the threshold -- no sample-specific exception.
 *
 * IMPORTANT, previously NOT true: before this fix, `engines`/
 * `promptsCount`/`runsPerPrompt`/`totalCallsExpected` below were read
 * ONLY by tests asserting this object's own shape -- lib/sample-audit/
 * run.ts never passed any of them into the real execution path
 * (lib/audit/run-audit-inline.ts). A sample audit silently ran the
 * free tier's real defaults instead (enginesForTier("free") = 2
 * engines, the global PROMPTS_PER_AUDIT = 10 prompts -- up to 20 real
 * calls, not 5), while this file and the UI's own footer text both
 * still claimed 1 engine / 5 prompts. `run.ts` now actually threads
 * every field below into `runAuditInline`'s override options, so this
 * object is the real, load-bearing truth, not aspirational metadata.
 *
 * `engines`: the SAME 2 engines (chatgpt, perplexity) a free-tier audit
 * already uses (lib/llm/tier-engines.ts's TIER_ENGINES.free) -- kept as
 * an explicit, independent override (not "whatever the free tier
 * happens to be today") so a future change to the free tier's own
 * engine list can never silently change what a sample audit costs or
 * how long it takes. Both engines are grounded (real-time web search)
 * by default -- chatgpt via ENGINE_WEB_SEARCH_CHATGPT (unset = on,
 * lib/llm/web-search-config.ts), perplexity always (no toggle exists
 * for that provider) -- the same ~14s/answer-with-web-search latency
 * production audit #30 showed applies here too.
 *
 * `promptsCount`: 6, not 5 or 10 -- picked over a 3-engine split
 * (e.g. 4 x 3) specifically to AVOID introducing a third engine (claude
 * or gemini) to this public, unauthenticated, pre-signup path for the
 * first time, reusing the two engines already proven here. 6 x 2 x 1 =
 * 12 total planned calls, so up to 2 engine failures still clear
 * MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE (10) -- enforced by this file's
 * own test, tests/unit/sample-audit/config.test.ts.
 *
 * `concurrencyLimit`: all 12 calls run in parallel already (the fastest
 * way to finish inside the route's time budget -- bounding concurrency
 * can only make total wall time LONGER, never shorter, so it's not
 * here to beat a deadline). It exists as a defensive cap against
 * bursting the provider's own rate limit when several different users
 * trigger a sample audit at the same moment (lib/audit/concurrency-
 * limit.ts's own doc comment).
 */
export const SAMPLE_AUDIT_CONFIG = {
  engines: ["chatgpt", "perplexity"] as const,
  promptsCount: 6,
  runsPerPrompt: 1,
  totalCallsExpected: 12,
  concurrencyLimit: 6,
  // Vunnara (sample-audit follow-up, 20 Oct): with full parallelism,
  // wall time tracks the SLOWEST single call, not the sum -- production
  // audit #30 averaged ~14s/answer with web search, so this is a
  // realistic typical figure, not 12 x per-call latency. Audit
  // reliability, Part A removed Perplexity's own internal retry loop
  // (lib/llm/with-retry.ts is now the one retry layer for all 4
  // engines, exactly one retry); Part C's SAMPLE_AUDIT_DEADLINE_MS
  // below is what actually bounds a genuinely worst-case run now, not
  // this figure.
  estimatedDurationSec: 30,
  // Vunnara (sample-audit follow-up, 20 Oct): 12 calls x ~US$0.036/call
  // (production audit #30's own real average, grounded) ~= US$0.43,
  // which the project's one AUD_PER_USD display rate (lib/constants/
  // currency.ts) puts at ~A$0.67 -- NOT the old, never-real $0.10. That
  // old figure was also never actually checked against anything real:
  // the cost-cap below compared this field to itself (see run.ts).
  estimatedCostAud: 0.7,
} as const;

/**
 * Audit reliability, Part C, item 1 -- from the 8ede3c7 report: each
 * call has a 30s timeout and the SDK makes up to 2 retries, so one
 * call used to be able to exceed the route's own 60s `maxDuration`
 * (vercel.json's entry for app/api/sample-audit/route.ts) -- work
 * still running in `after()` is then killed by the platform mid-
 * flight, and the sample stays "running" forever (never reaches its
 * own status: "complete" update). 50s leaves 10s of margin for the
 * DB writes/scoring/recommendations/drift steps that run after every
 * LLM call has already returned (or been aborted) -- see this file's
 * own estimatedDurationSec comment for why full parallelism means
 * wall time tracks the slowest single call, not the sum of all 12.
 *
 * Threaded into lib/audit/run-audit-inline.ts's deadlineAt override,
 * which lib/llm/with-retry.ts uses to skip a retry that wouldn't have
 * time to run, and every lib/llm/*-impl.ts uses (via web-search-
 * config.ts's deadlineAwareTimeoutMs) to bound its own abort signal --
 * a call still in flight when this deadline arrives is aborted then,
 * not only ever by its own fixed 30s ceiling. A real (non-sample)
 * audit never passes this -- Inngest steps have their own, much
 * longer durability budget, not a single HTTP response to finish
 * inside.
 */
export const SAMPLE_AUDIT_DEADLINE_MS = Number(process.env.SAMPLE_AUDIT_DEADLINE_MS ?? 50_000);

/**
 * Audit reliability, Part C, item 2 -- the stale-run guard's threshold
 * for a sample specifically: SAMPLE_AUDIT_DEADLINE_MS above already
 * bounds every LLM call, but the DB writes/scoring/recommendations/
 * drift steps that run after them (and the route's own cold start)
 * need their own margin too -- 30s on top, landing well inside a
 * generous read of "the platform killed this mid-flight" rather than
 * "it's just slow". Still comfortably tighter than
 * lib/audit/stale-audit-guard.ts's real-audit default (10 minutes):
 * a sample has no Inngest retries/step durability to wait out, so a
 * stuck one should be caught fast.
 */
export const SAMPLE_AUDIT_STALE_THRESHOLD_MS = SAMPLE_AUDIT_DEADLINE_MS + 30_000;
