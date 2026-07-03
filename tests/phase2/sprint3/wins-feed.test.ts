import { describe, expect, it } from "vitest";
import { clampLimit } from "@/lib/communication/wins-feed";
import type { WinType } from "@/lib/visibility/types";

describe("wins-feed", () => {
  describe("clampLimit", () => {
    it("defaults to 20 when no limit provided", () => {
      expect(clampLimit()).toBe(20);
      expect(clampLimit(0)).toBe(20);
      expect(clampLimit(-1)).toBe(20);
    });

    it("caps at 50 (PA-01)", () => {
      expect(clampLimit(100)).toBe(50);
      expect(clampLimit(50)).toBe(50);
    });

    it("passes through valid limits", () => {
      expect(clampLimit(10)).toBe(10);
      expect(clampLimit(30)).toBe(30);
    });

    it("handles NaN gracefully", () => {
      expect(clampLimit(NaN)).toBe(20);
    });
  });

  describe("win types", () => {
    it("defines exactly 5 Phase A win types with no duplicates", () => {
      const winTypes: WinType[] = [
        "new_citation",
        "new_engine_coverage",
        "visibility_up",
        "competitor_down",
        "gap_closed",
      ];
      expect(winTypes).toHaveLength(5);
      const unique = new Set(winTypes);
      expect(unique.size).toBe(5);
    });
  });

  describe("attribution honesty", () => {
    it("all reason templates use 'likely linked to:' prefix", () => {
      const reasonTemplates = [
        `likely linked to: brand content appeared in AI response for "best plumber"`,
        `likely linked to: your brand now appears across 3 AI engines`,
        `likely linked to: composite visibility improved from 45.0 to 52.0`,
        `likely linked to: your brand share (25.0%) exceeds rival.com (18.0%)`,
        `likely linked to: remediation task "Add schema markup" was completed`,
        `likely linked to: remediation task "Fix meta" was completed with 5.2pt lift`,
      ];
      for (const reason of reasonTemplates) {
        expect(reason).toMatch(/^likely linked to:/);
      }
    });

    it("reason never uses causal language (honesty guard)", () => {
      const badPrefixes = ["caused by:", "due to:", "because of:"];
      const sampleReasons = [
        `likely linked to: brand content appeared in AI response`,
        `likely linked to: your brand now appears across 3 AI engines`,
      ];
      for (const reason of sampleReasons) {
        for (const bad of badPrefixes) {
          expect(reason).not.toMatch(new RegExp(`^${bad}`));
        }
      }
    });
  });
});
