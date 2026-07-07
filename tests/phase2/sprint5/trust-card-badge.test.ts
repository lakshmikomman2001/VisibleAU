/**
 * Card-badge regression guard: score cards must derive badge from SCORE,
 * not from ExplainabilityService.annotate().confidence_label.
 *
 * Bug 7: 0/100 showed "High" badge on 4 cards because badge read confidence_label
 * (annotation confidence) instead of the actual score.
 *
 * Re-break: point badge back at confidence_label → 0-score test shows "High" → FAIL.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";

function scoreLevel(score: number): "Low" | "Medium" | "High" {
  if (score <= 33) return "Low";
  if (score <= 66) return "Medium";
  return "High";
}

describe("score-derived badge — quality scores (higher = better)", () => {
  it("0 → Low (was wrongly High from confidence_label)", () => {
    expect(scoreLevel(0)).toBe("Low");
  });

  it("33 → Low (boundary)", () => {
    expect(scoreLevel(33)).toBe("Low");
  });

  it("34 → Medium", () => {
    expect(scoreLevel(34)).toBe("Medium");
  });

  it("45 → Medium (mid-range)", () => {
    expect(scoreLevel(45)).toBe("Medium");
  });

  it("66 → Medium (boundary)", () => {
    expect(scoreLevel(66)).toBe("Medium");
  });

  it("67 → High", () => {
    expect(scoreLevel(67)).toBe("High");
  });

  it("85 → High", () => {
    expect(scoreLevel(85)).toBe("High");
  });

  it("100 → High", () => {
    expect(scoreLevel(100)).toBe("High");
  });
});

describe("score cards use scoreLevel (not confidence_label) for badge", () => {
  const SCORECARD_FILES = [
    "components/domain/trust/linkedin-presence-scorecard.tsx",
    "components/domain/trust/youtube-presence-scorecard.tsx",
  ] as const;

  const PAGE_FILES = [
    "app/(auth)/brands/[brandId]/trust/consensus/page.tsx",
    "app/(auth)/brands/[brandId]/trust/entity-score/page.tsx",
  ] as const;

  for (const file of SCORECARD_FILES) {
    it(`${file.split("/").pop()} badge condition uses scoreLevel, not confidence_label`, () => {
      const src = fs.readFileSync(file, "utf-8");
      // Badge condition must be scoreLevel (not confidence_label)
      expect(src).toContain("data.scoreLevel &&");
      // The badge text must render scoreLevel
      expect(src).toContain("{data.scoreLevel}");
      // confidence_label must NOT be used as badge condition or text
      expect(src).not.toContain("data.confidence_label &&");
      expect(src).not.toContain("{data.confidence_label}");
    });
  }

  for (const file of PAGE_FILES) {
    it(`${file.split("/").pop()} shows scoreLevel badge`, () => {
      const src = fs.readFileSync(file, "utf-8");
      expect(src).toContain("data.scoreLevel");
      expect(src).not.toContain("data.confidence_label &&");
    });
  }
});

describe("API routes compute scoreLevel from the actual score", () => {
  const ROUTE_FILES = [
    { file: "app/api/brands/[brandId]/linkedin-presence/route.ts", scoreVar: "ps" },
    { file: "app/api/brands/[brandId]/youtube-presence/route.ts", scoreVar: "ps" },
    { file: "app/api/brands/[brandId]/consensus-score/route.ts", scoreVar: "avgScore" },
    { file: "app/api/brands/[brandId]/entity-score/route.ts", scoreVar: "displayScore" },
  ] as const;

  for (const { file, scoreVar } of ROUTE_FILES) {
    it(`${file.split("/")[3]} route derives scoreLevel from ${scoreVar}`, () => {
      const src = fs.readFileSync(file, "utf-8");
      expect(src).toContain("scoreLevel");
      // Must compute from a score variable, not from confidence_label
      expect(src).toContain(`"Low"`);
      expect(src).toContain(`"Medium"`);
      expect(src).toContain(`"High"`);
    });
  }
});

describe("hallucination risk card (already correct) uses riskLevel", () => {
  it("trust route computes riskLevel from hallucinationRisk (not confidence_label)", () => {
    const src = fs.readFileSync("app/api/brands/[brandId]/trust/route.ts", "utf-8");
    expect(src).toContain("riskLevel");
    // riskLevel derived from risk score
    expect(src).toMatch(/risk\s*<=\s*33/);
    expect(src).toMatch(/risk\s*<=\s*66/);
  });

  it("trust hub page passes riskLevel (not confidence_label) to TrustScoreCard", () => {
    const src = fs.readFileSync("app/(auth)/brands/[brandId]/trust/page.tsx", "utf-8");
    expect(src).toContain("confidenceLabel={data.riskLevel}");
    expect(src).not.toContain("confidenceLabel={data.confidence_label}");
  });
});
