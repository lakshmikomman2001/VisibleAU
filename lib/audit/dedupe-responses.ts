export interface DedupableResponse {
  engine: string;
  prompt: string;
  responseSnippet: string | null;
}

/**
 * Task TTT: the Responses tab's evidence screen must not present cache
 * replays as independent runs. Task SSS confirmed the LLM cache key has
 * no run index, so runs 2-N of a given (engine, prompt) pair replay run
 * 1's exact response -- they are byte-identical, not new observations.
 *
 * Collapses rows whose response text is IDENTICAL within the same
 * (engine, prompt) group into the first occurrence, tagging it with how
 * many total rows shared that exact text (`replicaCount`). This is
 * content-based, not a hardcoded "5": if runs are ever made genuinely
 * independent (distinct response text per run), each distinct text keeps
 * its own row with `replicaCount` 1.
 *
 * Preserves the input's relative order (the caller's sort, e.g. newest
 * first) via first-occurrence position.
 */
export function dedupeResponses<T extends DedupableResponse>(
  rows: T[],
): Array<T & { replicaCount: number }> {
  const seen = new Map<string, T & { replicaCount: number }>();
  const order: string[] = [];

  for (const row of rows) {
    const key = `${row.engine}\u0000${row.prompt}\u0000${row.responseSnippet ?? ""}`;
    const existing = seen.get(key);
    if (existing) {
      existing.replicaCount++;
    } else {
      const withCount = { ...row, replicaCount: 1 };
      seen.set(key, withCount);
      order.push(key);
    }
  }

  return order.map((key) => {
    const entry = seen.get(key);
    if (!entry) throw new Error(`dedupeResponses: missing entry for key ${key}`);
    return entry;
  });
}
