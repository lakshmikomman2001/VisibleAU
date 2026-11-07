import type { FindingsData, ReportDirectoryRow, ReportEngineRow } from "./report-data";
import { citedDirectories } from "./report-format";

/**
 * DEMO-BLOCKER (1 Nov), parts 3 and 4 -- the rules that decide what the
 * report says is wrong or working, as predicates over ReportData. The
 * narrative's third paragraph and the diagnosis cards read these same
 * rules, in the same order, so they can't disagree.
 */

/** A directory needs at least this many citations to count as a gap. */
export const DIRECTORY_GAP_MIN_CITATIONS = 2;
/** An engine needs at least this many answers before "0 mentions" means something. */
export const SILENT_ENGINE_MIN_ANSWERS = 10;
/** "Listed near the top": a typical rank of at most this. */
export const STRENGTH_MAX_RANK = 3;

/**
 * (a) Directories cited at least twice where the owner's profile wasn't
 * among the citations -- because it was checked and never cited, or
 * because it isn't linked so it can't be checked -- most-cited first (top 3).
 */
export function directoryGaps(data: FindingsData): ReportDirectoryRow[] {
  return citedDirectories(data)
    .filter(
      (r) =>
        r.citedCount >= DIRECTORY_GAP_MIN_CITATIONS &&
        (!r.ownerProfileLinked || r.ownerProfileCitedCount === 0),
    )
    .slice(0, 3);
}

/** (b) Engines that answered at least 10 everyday questions and never mentioned the brand, while another engine did. */
export function silentEngines(data: FindingsData): ReportEngineRow[] {
  const answered = data.engines.filter((e) => !e.fullyFailed);
  if (!answered.some((e) => e.mentionedCount >= 1)) return [];
  return answered.filter(
    (e) => e.sampleCount >= SILENT_ENGINE_MIN_ANSWERS && e.mentionedCount === 0,
  );
}

/** (c) Engines every one of whose calls failed. */
export function failedEngines(data: FindingsData): ReportEngineRow[] {
  return data.engines.filter((e) => e.fullyFailed);
}

/** (d) When mentioned, typically ranked #1-#3, and at least half the mentions linked a source. */
export function isPositionStrength(data: FindingsData): boolean {
  return (
    data.mentionedCount > 0 &&
    data.rankedCount > 0 &&
    data.medianPosition !== null &&
    data.medianPosition <= STRENGTH_MAX_RANK &&
    data.sourcedCount * 2 >= data.mentionedCount
  );
}

/** (e) The configured competitor named in the most of the same answers, when that's more than the brand. */
export function competitorAhead(data: FindingsData): { name: string; mentions: number } | null {
  const ahead = data.competitors.rows
    .filter((c) => c.mentions > data.mentionedCount)
    .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
  return ahead[0] ?? null;
}

/**
 * Sri's decision (7 Nov): a Reddit page cited in at least this many everyday answers is evidence that AI
 * reads Reddit for these questions -- the same bar as a directory gap.
 */
export const REDDIT_MIN_CITATIONS = DIRECTORY_GAP_MIN_CITATIONS;

/** (f) The everyday answers that cited a Reddit page, when at least REDDIT_MIN_CITATIONS did. */
export function redditCited(data: FindingsData): { cited: number; total: number } | null {
  const { reddit, totalAnswers } = data.sources;
  return reddit >= REDDIT_MIN_CITATIONS ? { cited: reddit, total: totalAnswers } : null;
}
