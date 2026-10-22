/**
 * Vunnara (sample-audit follow-up, 20 Oct), item 4 -- a small, generic
 * concurrency limiter. `pLimit(n)` returns a function that runs at
 * most `n` of the async tasks passed to it at once, queueing the rest
 * -- not to beat a deadline (maximal parallelism already does that;
 * bounding concurrency can only make total wall time longer, never
 * shorter), but as a defensive cap against bursting a provider's own
 * rate limit when MANY concurrent requests (e.g. several different
 * users each triggering a sample audit at once) land on the same LLM
 * API key at the same moment. `n = Infinity` is a legitimate, explicit
 * "no limit" (the pre-existing behaviour for every caller that doesn't
 * opt in) -- `active < Infinity` is always true, so nothing is ever
 * queued.
 */
/**
 * "Audits time out on Vercel" follow-up, item 3 -- how many of ONE
 * engine's own calls run at once, when the 4 engines themselves are
 * now run concurrently (inngest/functions/run-audit.ts and lib/audit/
 * run-audit-inline.ts both use one pLimit(ENGINE_CALL_CONCURRENCY)
 * PER engine, never one limit shared across all four -- a single
 * slow or rate-limited engine must never starve the other three's
 * own concurrency budget). Assumption, not a measured number: every
 * one of OpenAI/Anthropic/Google/Perplexity's paid-tier APIs
 * comfortably allows well over 3 concurrent in-flight requests per
 * API key at the volumes a single audit's own 13-ish prompts
 * produce; this is a conservative floor chosen to stay well clear of
 * a burst limit none of the four providers' exact current numbers
 * were verified against for this account specifically -- Sri should
 * confirm (or override via a future per-engine value) against each
 * provider's own dashboard if audits ever start seeing 429s under
 * normal load at this concurrency.
 */
export const ENGINE_CALL_CONCURRENCY = 3;

/**
 * "Inngest: fit within the 5 concurrent steps of the free plan" --
 * the account's own Inngest plan limit, read fresh each call (not
 * cached at module load) so a test can override the env var and get
 * a different answer without reimporting. Defaults to 5, the Hobby
 * plan's own ceiling (confirmed via the Inngest dashboard, 22 Oct
 * 2026) -- override with INNGEST_ACCOUNT_CONCURRENCY once/if the
 * account moves to Pro (100) or another tier. Documented in
 * .env.example.
 */
export function getInngestAccountConcurrency(): number {
  return Number(process.env.INNGEST_ACCOUNT_CONCURRENCY) || 5;
}

/**
 * How many steps run-audit's own cascade of OTHER Inngest functions
 * (everything audit.complete fans out to -- lib/inngest/
 * concurrency.ts's POST_AUDIT_POOL) is allowed to use at once,
 * account-wide, while an audit's own call steps are the priority.
 * This is the SAME number POST_AUDIT_POOL.limit uses -- kept as one
 * tied-together constant, not two independent ones that could
 * silently drift apart.
 */
export const ACCOUNT_CONCURRENCY_HEADROOM_SLOTS = 1;

/**
 * The formula: split whatever the account's own concurrency ceiling
 * leaves over (after ACCOUNT_CONCURRENCY_HEADROOM_SLOTS for
 * everything else) evenly across this audit's own engines, floored
 * at 1 (an engine that's given up its own turn entirely would never
 * make progress at all) and capped at ENGINE_CALL_CONCURRENCY (more
 * account headroom than one audit could usefully spend per engine --
 * see that constant's own doc comment for why 3 is already a
 * deliberately conservative provider-side ceiling, not a target to
 * grow into).
 *
 * Example (the account's real Hobby-plan default): accountConcurrency
 * = 5, headroom = 1, a 4-engine (growth-tier) audit -> floor(4 / 4) =
 * 1 per engine. A hypothetical Pro-plan account (100): floor(99 / 4)
 * = 24, capped at ENGINE_CALL_CONCURRENCY = 3.
 */
export function deriveEngineCallConcurrency(
  engineCount: number,
  accountConcurrency: number = getInngestAccountConcurrency(),
): number {
  if (engineCount < 1) return ENGINE_CALL_CONCURRENCY;
  const perEngine = Math.floor((accountConcurrency - ACCOUNT_CONCURRENCY_HEADROOM_SLOTS) / engineCount);
  return Math.max(1, Math.min(ENGINE_CALL_CONCURRENCY, perEngine));
}

export function pLimit(concurrency: number) {
  if (concurrency < 1) throw new Error("pLimit: concurrency must be >= 1");

  let active = 0;
  const queue: Array<() => void> = [];

  function dequeue() {
    active--;
    const run = queue.shift();
    if (run) run();
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(
          (value) => {
            dequeue();
            resolve(value);
          },
          (err) => {
            dequeue();
            reject(err);
          },
        );
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
  };
}
