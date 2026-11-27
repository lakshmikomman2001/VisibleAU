import type { QuestionReach } from "@/db/schema/questions";

/**
 * S04 part 7 (LLD 8.4.6; contract P07.score, P07.interactions): how an audit's reaches are named -- no database, so the
 * report snapshot and the components can import it.
 */

/** "Local", then each reach's own label ("NSW", "Australia", "Worldwide"). */
export function reachShortName(reach: QuestionReach, label: string): string {
  return reach === "local" ? "Local" : label;
}

/** "Local, NSW and Australia". */
export function andList(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The headline's reach label (P07.score). */
export function reachHeadlineLabel(
  reaches: ReadonlyArray<{ reach: QuestionReach; label: string }>,
  localLabel: string,
): string {
  if (reaches.length <= 1) return localLabel;
  return `across ${andList(reaches.map((r) => reachShortName(r.reach, r.label)))}`;
}

/** The tile's hover sentence (P07.interactions). */
export function reachTileTooltip(tile: {
  mentioned: number;
  everydayAnswers: number;
  label: string;
}) {
  return `${tile.mentioned} of ${tile.everydayAnswers} everyday answers in ${tile.label} named you.`;
}
