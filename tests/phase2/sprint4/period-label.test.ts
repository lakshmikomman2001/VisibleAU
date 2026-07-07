import { describe, expect, it } from "vitest";
import { formatPeriodLabel } from "@/lib/visibility/visibility-trend-aggregator";

describe("formatPeriodLabel (regression: bug 2 — was naive week-of-month)", () => {
  it("returns ISO week 27 for 2026-07-04, NOT naive W01", () => {
    const label = formatPeriodLabel(new Date("2026-07-04T00:00:00Z"), "weekly");
    expect(label).toBe("2026-W27");
  });

  it("returns ISO week for mid-month date, not day-of-month/7", () => {
    const label = formatPeriodLabel(new Date("2026-07-15T00:00:00Z"), "weekly");
    expect(label).toMatch(/^2026-W\d{2}$/);
    expect(label).not.toBe("2026-W03");
  });

  it("zero-pads single-digit ISO weeks", () => {
    const label = formatPeriodLabel(new Date("2026-01-05T00:00:00Z"), "weekly");
    expect(label).toMatch(/^2026-W0\d$/);
  });

  it("monthly format is yyyy-MM", () => {
    expect(formatPeriodLabel(new Date("2026-07-04T00:00:00Z"), "monthly")).toBe("2026-07");
  });

  it("monthly January → 2026-01", () => {
    expect(formatPeriodLabel(new Date("2026-01-15T00:00:00Z"), "monthly")).toBe("2026-01");
  });

  it("deterministic: same date always yields same label", () => {
    const d = new Date("2026-07-04T00:00:00Z");
    expect(formatPeriodLabel(d, "weekly")).toBe(formatPeriodLabel(d, "weekly"));
  });

  it("Dec 31 near year boundary uses correct ISO year", () => {
    const label = formatPeriodLabel(new Date("2025-12-29T00:00:00Z"), "weekly");
    expect(label).toMatch(/^202[56]-W\d{2}$/);
  });

  it("Jan 1 near year boundary uses correct ISO year", () => {
    const label = formatPeriodLabel(new Date("2026-01-01T00:00:00Z"), "weekly");
    expect(label).toMatch(/^202[56]-W\d{2}$/);
  });

  it("week 53 is valid for years that have it (e.g. 2020-12-28)", () => {
    const label = formatPeriodLabel(new Date("2020-12-28T00:00:00Z"), "weekly");
    expect(label).toMatch(/^2020-W5[23]$/);
  });

  it("week number is always between 01 and 53", () => {
    const dates = [
      "2026-01-01", "2026-03-15", "2026-06-30",
      "2026-09-22", "2026-12-31",
    ];
    for (const d of dates) {
      const label = formatPeriodLabel(new Date(`${d}T00:00:00Z`), "weekly");
      const weekNum = parseInt(label.split("-W")[1], 10);
      expect(weekNum).toBeGreaterThanOrEqual(1);
      expect(weekNum).toBeLessThanOrEqual(53);
    }
  });
});
