import { describe, expect, it } from "vitest";
import {
  classifyArchetype,
  classifyMarketCompetition,
} from "@/lib/visibility/mention-source-divide";

describe("mention-source-divide", () => {
  it("classifies recognised_authority when mention>=20 and citation>=10", () => {
    const result = classifyArchetype(25, 15);
    expect(result.brandArchetype).toBe("recognised_authority");
    expect(result.mentionSourceRatio).toBeCloseTo(0.6, 2);
  });

  it("classifies known_but_untrusted when mention>=20 and citation<10", () => {
    const result = classifyArchetype(30, 5);
    expect(result.brandArchetype).toBe("known_but_untrusted");
  });

  it("classifies niche_authority when mention<20 and citation>=10", () => {
    const result = classifyArchetype(15, 12);
    expect(result.brandArchetype).toBe("niche_authority");
  });

  it("classifies invisible when mention<20 and citation<10", () => {
    const result = classifyArchetype(5, 3);
    expect(result.brandArchetype).toBe("invisible");
  });

  it("returns NULL mentionSourceRatio when mentionRate=0 → invisible", () => {
    const result = classifyArchetype(0, 0);
    expect(result.brandArchetype).toBe("invisible");
    expect(result.mentionSourceRatio).toBeNull();
  });

  it("uses exact boundary thresholds: mention=20, citation=10", () => {
    const atBoundary = classifyArchetype(20, 10);
    expect(atBoundary.brandArchetype).toBe("recognised_authority");

    const justBelow = classifyArchetype(19.9, 9.9);
    expect(justBelow.brandArchetype).toBe("invisible");
  });

  describe("market competition", () => {
    it("returns null when fewer than 2 competitors", () => {
      expect(classifyMarketCompetition(50, 25, 1)).toBeNull();
    });

    it("classifies category_leader when ratio > 2", () => {
      expect(classifyMarketCompetition(60, 20, 3)).toBe("category_leader");
    });

    it("classifies challenger when ratio between 0.5 and 2", () => {
      expect(classifyMarketCompetition(30, 25, 5)).toBe("challenger");
    });

    it("classifies niche_player when ratio < 0.5", () => {
      expect(classifyMarketCompetition(10, 30, 4)).toBe("niche_player");
    });
  });
});
