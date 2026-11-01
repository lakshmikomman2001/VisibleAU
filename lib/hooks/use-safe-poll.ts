import { useCallback, useEffect, useRef, useState } from "react";

/**
 * URGENT audit #38 (1 Nov) -- polling that can't pile up or freeze
 * silently. First written for the running-audit page (aa547c4), and
 * shared by every page that polls: the running audit, the public sample
 * audit, and a report while its PDF generates.
 *
 * - One request at a time, and one timer: the wait before the next poll
 *   (scheduled after each answer, never setInterval), or the watchdog of
 *   the request that's out.
 * - A request slower than SLOW_POLL_MS is still waited for, until
 *   POLL_GIVE_UP_MS (then aborted), and `behind` is true. So are
 *   FAILURES_BEFORE_BEHIND failed polls in a row. Behind, the next poll
 *   waits MAX_POLL_DELAY_MS, never less; an answer on time clears it.
 * - No wait is longer than MAX_POLL_DELAY_MS.
 * - `enabled` turning false (a terminal status) or unmounting clears the
 *   timer and aborts the request that's out.
 * - With maxWaitMs, polling stops that long after it started, and
 *   `timedOut` is true until restart().
 */
export const SLOW_POLL_MS = 10_000;
export const POLL_GIVE_UP_MS = 30_000;
export const MAX_POLL_DELAY_MS = 10_000;
/** Failed polls in a row (network, non-OK, given up) that also count as falling behind. */
export const FAILURES_BEFORE_BEHIND = 2;

/** The pages' "behind" line (the running-audit page keeps its own wording). */
export const STILL_WORKING_MESSAGE = "Still working · this will update when done";

/**
 * URGENT audit #37 (31 Oct), item 3 -- after a terminal status, the
 * navigation (or route refresh) is tried NAVIGATION_ATTEMPTS times,
 * NAVIGATION_RETRY_MS apart, while the page is still on screen, then the
 * fallback (a full load) once: within 12 s.
 */
export const NAVIGATION_RETRY_MS = 4_000;
export const NAVIGATION_ATTEMPTS = 3;

/** Full-page loads, behind an object so tests can watch them (jsdom can't navigate). */
export const pageNavigation = {
  reload: () => window.location.reload(),
  assign: (url: string) => window.location.assign(url),
};

export interface SafePollOptions<T> {
  /** Poll while true. False (a terminal status, nothing left to wait for) stops polling. */
  enabled: boolean;
  /**
   * One request. Resolves to null when it failed (network, non-OK,
   * aborted). `signal` aborts at POLL_GIVE_UP_MS, on unmount, and when
   * polling stops.
   */
  poll: (signal: AbortSignal) => Promise<T | null>;
  /** The wait before the first poll. */
  firstDelayMs: number;
  /** The wait after an answer on time, unless nextDelayMs is given. */
  intervalMs: number;
  /** The wait after an answer on time, from the last wait and the answer (null: it failed). */
  nextDelayMs?: (previousMs: number, result: T | null) => number;
  /** Stop polling this long after it started (or after restart()); `timedOut` is then true. */
  maxWaitMs?: number;
}

export interface SafePoll {
  /** A poll took longer than SLOW_POLL_MS, or FAILURES_BEFORE_BEHIND in a row failed. */
  behind: boolean;
  /** maxWaitMs passed and polling stopped. */
  timedOut: boolean;
  /** Start the max wait again, and polling if it had timed out (e.g. a new report was asked for). */
  restart: () => void;
}

export function useSafePoll<T>(options: SafePollOptions<T>): SafePoll {
  const { enabled } = options;
  // The latest options, read by the loop -- so a new poll function on
  // each render never restarts it (and never aborts the request that's out).
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const startedAtRef = useRef(0);
  const [behind, setBehind] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!enabled || timedOut) return;
    let stopped = false;
    // The loop's one timer: the wait before the next poll, or the
    // watchdog of the poll that's out -- never both.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | null = null;
    let failuresInARow = 0;
    let delay = optionsRef.current.firstDelayMs;
    startedAtRef.current = Date.now();

    const remainingMs = () => {
      const { maxWaitMs } = optionsRef.current;
      if (maxWaitMs === undefined) return Number.POSITIVE_INFINITY;
      return maxWaitMs - (Date.now() - startedAtRef.current);
    };

    const run = async () => {
      timer = undefined;
      if (stopped) return;
      if (remainingMs() <= 0) {
        stopped = true;
        setTimedOut(true);
        return;
      }
      const current = new AbortController();
      request = current;
      let slow = false;
      timer = setTimeout(() => {
        // Falling behind: say so, and give this request until the limit.
        slow = true;
        setBehind(true);
        timer = setTimeout(() => current.abort(), POLL_GIVE_UP_MS - SLOW_POLL_MS);
      }, SLOW_POLL_MS);
      // The limit holds even for a poll that ignores its signal.
      const gaveUp = new Promise<null>((resolve) => {
        current.signal.addEventListener("abort", () => resolve(null), { once: true });
      });
      const result = await Promise.race([
        optionsRef.current.poll(current.signal).catch(() => null),
        gaveUp,
      ]);
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      request = null;
      if (stopped) return;
      failuresInARow = result === null ? failuresInARow + 1 : 0;
      const fallingBehind = slow || failuresInARow >= FAILURES_BEFORE_BEHIND;
      setBehind(fallingBehind);
      const { intervalMs, nextDelayMs } = optionsRef.current;
      // Behind: the longest wait, never a faster retry.
      delay = fallingBehind
        ? MAX_POLL_DELAY_MS
        : Math.min(MAX_POLL_DELAY_MS, nextDelayMs ? nextDelayMs(delay, result) : intervalMs);
      // The max wait ends on time, not up to a whole wait late.
      timer = setTimeout(run, Math.max(0, Math.min(delay, remainingMs())));
    };

    timer = setTimeout(run, Math.max(0, Math.min(delay, remainingMs())));
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      request?.abort();
      setBehind(false);
    };
  }, [enabled, timedOut]);

  const restart = useCallback(() => {
    startedAtRef.current = Date.now();
    setTimedOut(false);
  }, []);

  return { behind: behind && enabled, timedOut: timedOut && enabled, restart };
}

/**
 * Once `active` (a terminal status), runs `attempt` (a navigation or a
 * route refresh) now and again every NAVIGATION_RETRY_MS while this
 * component is still on screen -- the page it leads to replacing this one
 * unmounts it and stops the retries -- then `fallback` (a full load) once
 * if NAVIGATION_ATTEMPTS didn't do it. An attempt that throws counts as
 * one that didn't work.
 */
export function useRetriedNavigation(
  active: boolean,
  navigation: { attempt: () => void; fallback: () => void },
): void {
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;

  useEffect(() => {
    if (!active) return;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryOnce = () => {
      timer = undefined;
      if (attempts >= NAVIGATION_ATTEMPTS) {
        navigationRef.current.fallback();
        return;
      }
      attempts += 1;
      try {
        navigationRef.current.attempt();
      } catch {
        /* didn't work: the next attempt, or the fallback, follows */
      }
      timer = setTimeout(tryOnce, NAVIGATION_RETRY_MS);
    };
    tryOnce();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [active]);
}
