import { describe, expect, it } from "vitest";
import {
  computeVolatility,
  formatPeriodLabel,
} from "@/lib/visibility/visibility-trend-aggregator";

describe("visibility-trend-aggregator", () => {
  describe("formatPeriodLabel", () => {
    it("formats weekly period as yyyy-'W'II", () => {
      const label = formatPeriodLabel(new Date("2026-06-09"), "weekly");
      expect(label).toMatch(/^2026-W\d{2}$/);
      expect(label).toBe("2026-W24");
    });

    it("formats monthly period as yyyy-MM", () => {
      const label = formatPeriodLabel(new Date("2026-06-15"), "monthly");
      expect(label).toBe("2026-06");
    });

    it("pads single-digit months", () => {
      const label = formatPeriodLabel(new Date("2026-01-15"), "monthly");
      expect(label).toBe("2026-01");
    });
  });

  describe("computeVolatility", () => {
    it("returns NULL when auditCount < 3", () => {
      expect(computeVolatility([10, 20], 2)).toBeNull();
    });

    it("returns NULL when historicalRates < 3", () => {
      expect(computeVolatility([10, 20], 5)).toBeNull();
    });

    it("computes std-dev of citation rates", () => {
      const rates = [10, 10, 10, 10];
      const vol = computeVolatility(rates, 4);
      expect(vol).toBe(0);
    });

    it("detects volatile citation rates (> 15.0)", () => {
      const rates = [5, 50, 10, 45, 8, 42];
      const vol = computeVolatility(rates, 6);
      expect(vol).not.toBeNull();
      expect(vol!).toBeGreaterThan(15.0);
    });

    it("detects stable citation rates (<= 15.0)", () => {
      const rates = [20, 22, 21, 23, 19];
      const vol = computeVolatility(rates, 5);
      expect(vol).not.toBeNull();
      expect(vol!).toBeLessThanOrEqual(15.0);
    });

    it("returns exact std-dev for known input", () => {
      const rates = [10, 20, 30];
      const vol = computeVolatility(rates, 3);
      // mean=20, variance=((10-20)²+(20-20)²+(30-20)²)/3 = 200/3, stdDev=√(66.67)=8.165
      expect(vol).toBeCloseTo(8.16, 2);
    });

    it("rounds to 2 decimal places", () => {
      const rates = [10, 20, 30];
      const vol = computeVolatility(rates, 3);
      expect(vol).not.toBeNull();
      const decimalStr = String(vol!).split(".")[1] ?? "";
      expect(decimalStr.length).toBeLessThanOrEqual(2);
    });
  });
});
