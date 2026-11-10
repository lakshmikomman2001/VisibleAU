"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, fetchOrFail, LoadFailure, readJson } from "@/lib/load/fetch-json";

/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 1 -- the one way a client page loads what it shows. Four
 * states, never a fifth: loading, error (it couldn't load: say so, with Try again), empty (it loaded and
 * there's nothing), ready. A page renders the empty state only from "empty", which only a load that worked
 * can reach, so an empty list or a form's defaults never stand in for "we couldn't load it".
 *
 * - `load` runs on mount, whenever it changes (memoise it with useCallback on what it reads), and on
 *   retry(). Its `signal` aborts on unmount and when a newer load starts; an aborted load's answer is dropped.
 * - A load that throws is "error". A LoadFailure's `detail` (the server's own reason) and `httpStatus` are
 *   kept for the page.
 * - A new `load` (another brand, say) starts from "loading", so one brand's data never shows under another.
 *   retry() after an error shows "loading" too; retry() after data keeps it on screen until the answer.
 * - `enabled: false` (a plan-locked feature) doesn't load at all and stays "loading": the page shows its
 *   locked card instead.
 */
export type LoadState<T> =
  | { status: "loading"; data: null; detail: null }
  | { status: "error"; data: null; detail: string | null; httpStatus: number | null }
  | { status: "empty"; data: T; detail: null }
  | { status: "ready"; data: T; detail: null };

export type Loaded<T> = LoadState<T> & { retry: () => void };

export interface LoadOptions<T> {
  enabled?: boolean;
  /** Whether loaded data is "empty" (nothing to show), not "ready". */
  isEmpty?: (data: T) => boolean;
}

const LOADING = { status: "loading", data: null, detail: null } as const;

export function useLoad<T>(
  load: (signal: AbortSignal) => Promise<T>,
  options: LoadOptions<T> = {},
): Loaded<T> {
  const { enabled = true } = options;
  const [state, setState] = useState<LoadState<T>>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const isEmpty = useRef(options.isEmpty);
  isEmpty.current = options.isEmpty;
  const lastLoad = useRef(load);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is what retry() changes, to run it again
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    if (lastLoad.current !== load) {
      lastLoad.current = load;
      setState(LOADING);
    } else {
      setState((s) => (s.status === "error" ? LOADING : s));
    }
    // Telling empty from ready runs inside the chain, so an answer it can't read (a 2xx without the list it
    // should have: `isEmpty` throws) is "error" too, never an unhandled rejection with the page left loading.
    load(controller.signal)
      .then((data) => ({ data, empty: isEmpty.current?.(data) === true }))
      .then(
        ({ data, empty }) => {
          if (controller.signal.aborted) return;
          setState(
            empty
              ? { status: "empty", data, detail: null }
              : { status: "ready", data, detail: null },
          );
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setState({
            status: "error",
            data: null,
            detail: error instanceof LoadFailure ? error.detail : null,
            httpStatus: error instanceof LoadFailure ? error.status : null,
          });
        },
      );
    return () => controller.abort();
  }, [load, enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

/** A page's GET of JSON; anything that isn't 2xx is "error". `url` null doesn't load. */
export function useJson<T>(url: string | null, options: LoadOptions<T> = {}): Loaded<T> {
  const load = useCallback((signal: AbortSignal) => fetchJson<T>(url ?? "", { signal }), [url]);
  return useLoad(load, { ...options, enabled: (options.enabled ?? true) && url !== null });
}

/**
 * A brand page's GET behind a plan (useBrandFeatureGate): `planRefused` locks the page and the data is null
 * then; anything else that isn't 2xx is "error". `url` null doesn't load.
 */
export function useGatedJson<T>(
  url: string | null,
  planRefused: (res: Response) => Promise<boolean>,
  options: LoadOptions<T | null> = {},
): Loaded<T | null> {
  const load = useCallback(
    async (signal: AbortSignal): Promise<T | null> => {
      const res = await fetchOrFail(url ?? "", { signal });
      if (await planRefused(res)) return null;
      return readJson<T>(res);
    },
    [url, planRefused],
  );
  return useLoad(load, { ...options, enabled: (options.enabled ?? true) && url !== null });
}
