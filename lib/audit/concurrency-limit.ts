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
