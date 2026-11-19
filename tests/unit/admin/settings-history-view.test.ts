/**
 * 19 Nov (Sri's review of /admin/settings): Omega Services' 13 rows "2153 → 2153", repeated clicks of Save on 11 Nov,
 * show as one line "13 saves, no change"; a real change, or a no-change save of something else, stays its own row.
 * The rows themselves aren't deleted (lib/admin/settings-history-view.ts only folds what the page shows).
 */
import { describe, expect, it } from "vitest";
import {
  collapseNoChangeSaves,
  noChangeText,
  sameSettingValue,
  type SettingsHistoryEntry,
} from "@/lib/admin/settings-history-view";

const row = (over: Partial<SettingsHistoryEntry>): SettingsHistoryEntry => ({
  at: "2026-11-11T09:00:00.000Z",
  setting: "google_location_postcode",
  target: "Omega Services",
  from: "2153",
  to: "2153",
  by: "operator@example.test",
  ...over,
});

describe("the Changes log folds repeated saves that changed nothing", () => {
  it("13 identical no-change saves in a row are one line, newest first, with the first and last time", () => {
    const history = Array.from({ length: 13 }, (_, i) =>
      row({ at: new Date(Date.UTC(2026, 10, 11, 9, 13 - i)).toISOString() }),
    );
    const rows = collapseNoChangeSaves(history);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.saves).toBe(13);
    expect(rows[0]?.at).toBe("2026-11-11T09:13:00.000Z");
    expect(rows[0]?.firstAt).toBe("2026-11-11T09:01:00.000Z");
    expect(rows[0] && noChangeText(rows[0], "2153")).toBe("13 saves, no change (2153)");
  });

  it("a real change between them breaks the run; changes are never folded", () => {
    const rows = collapseNoChangeSaves([
      row({ at: "2026-11-12T00:03:00.000Z" }),
      row({ at: "2026-11-12T00:02:00.000Z" }),
      row({ at: "2026-11-12T00:01:00.000Z", from: "2150", to: "2153" }),
      row({ at: "2026-11-12T00:00:00.000Z", from: "2150", to: "2153" }),
      row({ at: "2026-11-11T23:59:00.000Z" }),
    ]);
    expect(rows.map((r) => [r.saves, r.noChange])).toEqual([
      [2, true],
      [1, false],
      [1, false],
      [1, true],
    ]);
    expect(rows[1] && noChangeText(rows[1], "2153")).toBeNull();
    expect(rows[3] && noChangeText(rows[3], "2153")).toBe("No change (2153)");
  });

  it("no-change saves of another setting, brand, value or person aren't folded together", () => {
    const rows = collapseNoChangeSaves([
      row({}),
      row({ target: "Hero Home Services" }),
      row({ setting: "google_surfaces_device", from: "desktop", to: "desktop" }),
      row({ by: "someone-else@example.test" }),
      row({ from: "2161", to: "2161" }),
    ]);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.saves === 1)).toBe(true);
  });

  it("values compare as stored JSON: a { postcode } object, booleans and null", () => {
    expect(sameSettingValue({ postcode: "2153" }, { postcode: "2153" })).toBe(true);
    expect(sameSettingValue({ postcode: "2153" }, { postcode: "2161" })).toBe(false);
    expect(sameSettingValue(true, true)).toBe(true);
    expect(sameSettingValue(null, undefined)).toBe(true);
    expect(sameSettingValue(false, null)).toBe(false);
  });
});
