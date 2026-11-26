/**
 * S02 part 0B (LLD amendment 68; contract v1.7 P09.next): OTHER ACTIONS FROM THIS AUDIT keeps the order the agency
 * saved for it in the report contents panel; otherwise High, Medium, Low, then newest first (amendment 61). The panel
 * lists the actions the agency hasn't placed in that same order, so saving it without reordering keeps it.
 */
import { describe, expect, it } from "vitest";
import {
  assembleWhatToDoNext,
  type MeasuredActionSource,
  orderOtherActions,
} from "@/lib/reports/report-contents";

const action = (
  key: string,
  priority: MeasuredActionSource["priority"],
  createdAt: string | null,
): MeasuredActionSource => ({
  key,
  actionItemId: key,
  title: `Action ${key}`,
  evidence: "…",
  priority,
  status: "open",
  createdAt,
});

const LOW_NEW = action("low-new", "low", "2026-11-20T00:00:00.000Z");
const LOW_OLD = action("low-old", "low", "2026-11-01T00:00:00.000Z");
const MEDIUM = action("medium", "medium", "2026-10-01T00:00:00.000Z");
const HIGH = action("high", "high", null);

const keys = (items: ReadonlyArray<{ key: string }>) => items.map((i) => i.key);

describe("orderOtherActions", () => {
  it("with no saved order: High, Medium, Low, then the newest first", () => {
    expect(keys(orderOtherActions([LOW_OLD, MEDIUM, LOW_NEW, HIGH]))).toEqual([
      "high",
      "medium",
      "low-new",
      "low-old",
    ]);
  });

  it("with a saved order: that order, even Low before High", () => {
    const saved = [
      { ...HIGH, position: 2 },
      { ...LOW_OLD, position: 0 },
      { ...MEDIUM, position: 1 },
    ];
    expect(keys(orderOtherActions(saved))).toEqual(["low-old", "medium", "high"]);
  });

  it("an action the agency hasn't placed follows the saved ones, in the group's own order", () => {
    const items = [
      { ...LOW_OLD, position: 1 },
      { ...HIGH, position: null },
      { ...MEDIUM, position: 0 },
      { ...LOW_NEW, position: undefined },
    ];
    expect(keys(orderOtherActions(items))).toEqual(["medium", "low-old", "high", "low-new"]);
  });
});

describe("assembleWhatToDoNext (the report contents panel and the PDF's input)", () => {
  const base = {
    agencyActions: [],
    doneSinceLast: [],
    generalAdvice: [],
    includeGeneralAdvice: true,
    includeDoneSinceLast: true,
  };

  it("Agency and up: each action carries its saved place; the saved ones first, the rest in the group's order", () => {
    const next = assembleWhatToDoNext({
      ...base,
      curated: true,
      measured: [LOW_OLD, MEDIUM, LOW_NEW, HIGH],
      choices: [{ actionItemId: "low-old", included: true, position: 0, note: null }],
    });
    expect(keys(next.measured)).toEqual(["low-old", "high", "medium", "low-new"]);
    expect(next.measured.map((m) => m.position)).toEqual([0, null, null, null]);
  });

  it("the findings the agency hasn't placed keep their own order, before the other items", () => {
    const findingB = { ...action("finding-b", "medium", null), findingRule: "b" as const };
    const findingA = { ...action("finding-a", "high", null), findingRule: "a" as const };
    const next = assembleWhatToDoNext({
      ...base,
      curated: true,
      measured: [findingB, findingA, LOW_OLD, HIGH],
      choices: [],
    });
    expect(keys(next.measured)).toEqual(["finding-b", "finding-a", "high", "low-old"]);
  });

  it("a panel saved without reordering gives the same order as none saved", () => {
    const untouched = assembleWhatToDoNext({
      ...base,
      curated: true,
      measured: [LOW_OLD, MEDIUM, LOW_NEW, HIGH],
      choices: [],
    });
    const savedAsShown = assembleWhatToDoNext({
      ...base,
      curated: true,
      measured: [LOW_OLD, MEDIUM, LOW_NEW, HIGH],
      choices: untouched.measured.map((m, i) => ({
        actionItemId: m.key,
        included: true,
        position: i,
        note: null,
      })),
    });
    expect(keys(orderOtherActions(savedAsShown.measured))).toEqual(
      keys(orderOtherActions(untouched.measured)),
    );
  });

  it("Growth (not curated): no saved places, so the PDF uses the group's own order", () => {
    const next = assembleWhatToDoNext({
      ...base,
      curated: false,
      measured: [LOW_OLD, HIGH],
      choices: [{ actionItemId: "low-old", included: true, position: 0, note: null }],
    });
    expect(next.measured.every((m) => m.position === undefined)).toBe(true);
    expect(keys(orderOtherActions(next.measured))).toEqual(["high", "low-old"]);
  });
});
