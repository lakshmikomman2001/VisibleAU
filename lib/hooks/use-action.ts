"use client";

import { useCallback, useState } from "react";
import { actionFailureMessage } from "@/lib/load/fetch-json";

/**
 * Follow-ups from af8de42..d1eb5a1, part 1 -- a button that asks the server to do something (Refresh,
 * Confirm) and says why when it couldn't. The brand pages' Refresh buttons ignored the answer: a refused or
 * failed check reloaded the old data and said nothing.
 *
 * - `planRefused` (useBrandFeatureGate's) locks the page on a plan refusal; nothing else happens.
 * - Any other answer that isn't 2xx is `error`, in the server's words, else `failure`.
 * - A 2xx answer calls `onDone` (reload what the page shows).
 */
export interface PostAction {
  running: boolean;
  error: string | null;
  run: (init?: RequestInit) => Promise<void>;
}

const NO_ANSWER = "Check your connection and try again.";

export function usePostAction(
  url: string,
  {
    planRefused,
    onDone,
    failure,
  }: {
    planRefused?: (res: Response) => Promise<boolean>;
    onDone: () => void;
    /** What failed, as a sentence: "The check couldn't be run." */
    failure: string;
  },
): PostAction {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (init?: RequestInit) => {
      setRunning(true);
      setError(null);
      try {
        const res = await fetch(url, { method: "POST", ...init });
        if (planRefused && (await planRefused(res))) return;
        if (!res.ok) {
          setError(await actionFailureMessage(res, failure));
          return;
        }
        onDone();
      } catch {
        setError(`${failure} ${NO_ANSWER}`);
      } finally {
        setRunning(false);
      }
    },
    [url, planRefused, onDone, failure],
  );
  return { running, error, run };
}
