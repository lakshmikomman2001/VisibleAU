import { describe, expect, it } from "vitest";
import { formatRate, formatRatio } from "@/lib/communication/format-helpers";

describe("formatRate (regression: bug 3 — 7000% + Drizzle-string .toFixed crash)", () => {
  it("formats an already-0-100 numeric as percent (NO ×100)", () => {
    expect(formatRate(70)).toBe("70.0%");
  });

  it("handles Drizzle NUMERIC returned as STRING without crashing", () => {
    expect(() => formatRate("70.00" as unknown as number)).not.toThrow();
    expect(formatRate("70.00" as unknown as number)).toBe("70.0%");
  });

  it("zero renders 0.0%, not NaN", () => {
    expect(formatRate("0.00" as unknown as number)).toBe("0.0%");
    expect(formatRate(0)).toBe("0.0%");
  });

  it("never exceeds 100% for a valid rate", () => {
    const out = formatRate("100.00" as unknown as number);
    expect(parseFloat(out)).toBeLessThanOrEqual(100);
  });

  it("100 renders 100.0%", () => {
    expect(formatRate(100)).toBe("100.0%");
  });

  it("fractional rate renders to 1dp", () => {
    expect(formatRate(33.333)).toBe("33.3%");
    expect(formatRate("55.67" as unknown as number)).toBe("55.7%");
  });

  it("small Drizzle string like '0.50' renders 0.5%", () => {
    expect(formatRate("0.50" as unknown as number)).toBe("0.5%");
  });

  it("negative rate (edge case) does not crash", () => {
    expect(formatRate(-1)).toBe("-1.0%");
  });
});

describe("formatRatio (regression: bug 3-sibling — ratio NULL when mention_rate=0)", () => {
  it("renders N/A when ratio is null (brand not mentioned), not a crash", () => {
    expect(formatRatio(null)).toMatch(/N\/A/i);
  });

  it("N/A message includes 'brand not mentioned' context", () => {
    expect(formatRatio(null)).toContain("brand not mentioned");
  });

  it("formats a real ratio to 2dp", () => {
    expect(formatRatio(1)).toBe("1.00");
    expect(formatRatio(0.5)).toBe("0.50");
  });

  it("handles Drizzle NUMERIC string coercion", () => {
    expect(formatRatio("1.23" as unknown as number)).toBe("1.23");
  });

  it("zero ratio renders '0.00', not N/A", () => {
    expect(formatRatio(0)).toBe("0.00");
  });

  it("large ratio renders correctly", () => {
    expect(formatRatio(15.789)).toBe("15.79");
  });
});
