import { describe, it, expect } from "vitest";
import { computeHallucinationRisk } from "@/lib/trust/hallucination-risk";

describe("computeHallucinationRisk — CT-04: LEAST(100, 15c+5w+1i)", () => {
  it("1 critical + 1 warning → 20", () => {
    const incidents = [
      { severity: "critical" as const, isFalsePositive: false },
      { severity: "warning" as const, isFalsePositive: false },
    ];
    expect(computeHallucinationRisk(incidents)).toBe(20);
  });

  it("returns 0 for empty array", () => {
    expect(computeHallucinationRisk([])).toBe(0);
  });

  it("caps at 100", () => {
    const incidents = Array.from({ length: 10 }, () => ({
      severity: "critical" as const,
      isFalsePositive: false,
    }));
    expect(computeHallucinationRisk(incidents)).toBe(100);
  });

  it("acknowledging does NOT lower risk", () => {
    const incidents = [
      { severity: "critical" as const, isFalsePositive: false },
    ];
    expect(computeHallucinationRisk(incidents)).toBe(15);
  });

  it("marking false-positive DOES lower risk", () => {
    const incidents = [
      { severity: "critical" as const, isFalsePositive: true },
      { severity: "warning" as const, isFalsePositive: false },
    ];
    expect(computeHallucinationRisk(incidents)).toBe(5);
  });

  it("info severity contributes 1 point each", () => {
    const incidents = [
      { severity: "info" as const, isFalsePositive: false },
      { severity: "info" as const, isFalsePositive: false },
      { severity: "info" as const, isFalsePositive: false },
    ];
    expect(computeHallucinationRisk(incidents)).toBe(3);
  });

  it("mixed severities compute correctly", () => {
    const incidents = [
      { severity: "critical" as const, isFalsePositive: false },
      { severity: "warning" as const, isFalsePositive: false },
      { severity: "info" as const, isFalsePositive: false },
    ];
    expect(computeHallucinationRisk(incidents)).toBe(21);
  });

  it("excludes all false-positive rows", () => {
    const incidents = [
      { severity: "critical" as const, isFalsePositive: true },
      { severity: "warning" as const, isFalsePositive: true },
    ];
    expect(computeHallucinationRisk(incidents)).toBe(0);
  });
});
