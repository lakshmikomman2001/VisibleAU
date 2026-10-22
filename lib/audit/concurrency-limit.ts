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
