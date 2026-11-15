/**
 * Leftovers task, part 3 (17 Nov): what a request to someone else's site or service got, in the three states a check
 * can end in -- found, absent, or couldn't check -- and never a failed request read as "absent".
 *
 * Only a 404 or 410 says a file isn't there. A 401 or 403 (blocked), a 429 (rate-limited), any other 4xx, a 5xx, a
 * timeout or no answer at all says nothing about the file: the check couldn't be made, and the page says why
 * ("Couldn't check (timed out)"), never "Not found", and no score counts it.
 */
export type FetchOutcome =
  | { state: "found" }
  | { state: "absent" }
  | { state: "unchecked"; reason: string };

/** What a response with this status (not a 2xx) says about the file. */
export function outcomeForStatus(status: number): FetchOutcome {
  if (status === 404 || status === 410) return { state: "absent" };
  if (status === 401 || status === 403)
    return { state: "unchecked", reason: `blocked, HTTP ${status}` };
  if (status === 429) return { state: "unchecked", reason: "rate-limited, HTTP 429" };
  return { state: "unchecked", reason: `HTTP ${status}` };
}

/** What a request that threw (fetch rejected) says: a timeout, or no answer. */
export function outcomeForError(err: unknown): FetchOutcome {
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError")
    return { state: "unchecked", reason: "timed out" };
  return { state: "unchecked", reason: "no answer" };
}

/** "Couldn't check (timed out)". */
export function couldntCheck(reason: string): string {
  return `Couldn't check (${reason})`;
}

/**
 * Several requests for one thing (ai.txt at two paths, MCP at two): found if any was found; absent only if every
 * one said absent; otherwise couldn't check, with the first reason.
 */
export function combineOutcomes(outcomes: readonly FetchOutcome[]): FetchOutcome {
  if (outcomes.some((o) => o.state === "found")) return { state: "found" };
  const unchecked = outcomes.find(
    (o): o is Extract<FetchOutcome, { state: "unchecked" }> => o.state === "unchecked",
  );
  return unchecked ?? { state: "absent" };
}
