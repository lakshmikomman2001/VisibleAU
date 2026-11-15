/**
 * 17 Nov, part 3 -- how a stored journey run reaches the page.
 *
 * journey_run_results.turn_results is the runner's TurnResult[] as JSON (lib/conversational/types.ts), whose
 * key is `brand_mentioned`. The page's chips read `brandMentioned`, so every turn showed grey, "not named",
 * whatever the answer said. journeyTurnChips reads the stored key (and the camelCase one, should a row have
 * it); a turn with neither is null, "not recorded", never a "no".
 */
export interface JourneyTurnChip {
  turn: number;
  /** Whether that turn's answer contained the business name (a text match); null when not recorded. */
  brandMentioned: boolean | null;
}

export function journeyTurnChips(stored: unknown): JourneyTurnChip[] {
  if (!Array.isArray(stored)) return [];
  const chips: JourneyTurnChip[] = [];
  for (const item of stored) {
    if (typeof item !== "object" || item === null) continue;
    const fields = item as Record<string, unknown>;
    if (typeof fields.turn !== "number") continue;
    const named = fields.brand_mentioned ?? fields.brandMentioned;
    chips.push({ turn: fields.turn, brandMentioned: typeof named === "boolean" ? named : null });
  }
  return chips;
}

export interface JourneyRunLike {
  engine: string;
  runAt: string;
}

/**
 * Every run of a journey is kept, and repeat runs looked identical on the page. Each engine's latest run comes
 * first (newest first), marked latest; the earlier runs follow, newest first. Each card shows its run date.
 */
export function orderJourneyRuns<T extends JourneyRunLike>(
  runs: readonly T[],
): Array<{ run: T; latestForEngine: boolean }> {
  const newestFirst = [...runs].sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt));
  const seen = new Set<string>();
  const latest: T[] = [];
  const earlier: T[] = [];
  for (const run of newestFirst) {
    if (seen.has(run.engine)) earlier.push(run);
    else {
      seen.add(run.engine);
      latest.push(run);
    }
  }
  return [
    ...latest.map((run) => ({ run, latestForEngine: true })),
    ...earlier.map((run) => ({ run, latestForEngine: false })),
  ];
}
