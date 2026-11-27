/**
 * 19 Nov (Sri's review of /admin/settings): the Changes log showed Yabby Services' 13 identical rows "2153 → 2153",
 * each a click of Save on 11 Nov, before saving the value in force stopped writing a row (12 Nov:
 * lib/governance/google-surfaces.ts returns "unchanged" and writes nothing). Those rows stay -- the log is a history --
 * but consecutive identical saves that changed nothing are shown as one line: "13 saves, no change".
 *
 * Pure and client-safe: the page's client component folds what the server loaded.
 */

/** One row of the change history as the page gets it (GoogleSurfaceHistoryEntry). */
export interface SettingsHistoryEntry {
  at: string;
  setting: string;
  target: string | null;
  from: unknown;
  to: unknown;
  by: string | null;
}

/** A row to show: one change, or a run of identical saves that changed nothing. */
export type SettingsHistoryRow<T extends SettingsHistoryEntry> = T & {
  /** How many saves this row stands for: 1 for a change; more for identical no-change saves folded together. */
  saves: number;
  /** The earliest of the folded saves (`at` is the latest). */
  firstAt: string;
  /** The save wrote the value already in force. */
  noChange: boolean;
};

/** Two stored values are the same value (they're JSON: a boolean, a number, a string, { postcode }). */
export function sameSettingValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Folds each run of consecutive rows (newest first, as the page lists them) that are the same no-change save -- the
 * same setting, place, value and person -- into one row with its count. A change, or a no-change save of anything
 * else, breaks the run.
 */
export function collapseNoChangeSaves<T extends SettingsHistoryEntry>(
  history: readonly T[],
): SettingsHistoryRow<T>[] {
  const rows: SettingsHistoryRow<T>[] = [];
  for (const entry of history) {
    const noChange = sameSettingValue(entry.from, entry.to);
    const last = rows[rows.length - 1];
    if (
      noChange &&
      last?.noChange &&
      last.setting === entry.setting &&
      last.target === entry.target &&
      last.by === entry.by &&
      sameSettingValue(last.to, entry.to)
    ) {
      last.saves += 1;
      last.firstAt = entry.at;
      continue;
    }
    rows.push({ ...entry, saves: 1, firstAt: entry.at, noChange });
  }
  return rows;
}

/** "13 saves, no change (2153)", "No change (2153)", or null for a real change (the page shows "from → to"). */
export function noChangeText(
  row: { saves: number; noChange: boolean },
  value: string,
): string | null {
  if (!row.noChange) return null;
  return row.saves > 1 ? `${row.saves} saves, no change (${value})` : `No change (${value})`;
}
