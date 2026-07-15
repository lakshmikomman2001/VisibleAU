import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const trendRoute = readFileSync(
  path.resolve("app/api/brands/[brandId]/prompts/[promptId]/trend/route.ts"),
  "utf-8",
);
const actionProgressRoute = readFileSync(
  path.resolve("app/api/brands/[brandId]/action-progress/route.ts"),
  "utf-8",
);

describe("brand-access gate on all S9 brand-scoped routes (S8b-01)", () => {
  describe("prompt trend route", () => {
    it("calls assertBrandAccess", () => {
      expect(trendRoute).toContain("assertBrandAccess");
    });

    it("imports BrandAccessDeniedError", () => {
      expect(trendRoute).toContain("BrandAccessDeniedError");
    });

    it("returns 404 on denied brand access (not 403)", () => {
      const deniedBlock = trendRoute.slice(
        trendRoute.indexOf("BrandAccessDeniedError"),
      );
      expect(deniedBlock).toContain("404");
    });

    it("imports from governance module", () => {
      expect(trendRoute).toMatch(
        /import.*assertBrandAccess.*from.*governance/s,
      );
    });
  });

  describe("action-progress route", () => {
    it("calls assertBrandAccess", () => {
      expect(actionProgressRoute).toContain("assertBrandAccess");
    });

    it("imports BrandAccessDeniedError", () => {
      expect(actionProgressRoute).toContain("BrandAccessDeniedError");
    });

    it("returns 404 on denied brand access (not 403)", () => {
      const deniedBlock = actionProgressRoute.slice(
        actionProgressRoute.indexOf("BrandAccessDeniedError"),
      );
      expect(deniedBlock).toContain("404");
    });

    it("imports from governance module", () => {
      expect(actionProgressRoute).toMatch(
        /import.*assertBrandAccess.*from.*governance/s,
      );
    });
  });

  describe("cross-route consistency", () => {
    it("both routes use the same assertBrandAccess + 404 pattern", () => {
      const trendPattern = trendRoute.includes("BrandAccessDeniedError")
        && trendRoute.includes("assertBrandAccess")
        && trendRoute.includes("404");
      const actionPattern = actionProgressRoute.includes("BrandAccessDeniedError")
        && actionProgressRoute.includes("assertBrandAccess")
        && actionProgressRoute.includes("404");
      expect(trendPattern).toBe(true);
      expect(actionPattern).toBe(true);
    });

    it("both routes validate brandId as UUID before access check", () => {
      expect(trendRoute).toMatch(/uuid.*safeParse|safeParse.*brandId/s);
      expect(actionProgressRoute).toMatch(/uuid.*safeParse|safeParse.*brandId/s);
    });

    it("both routes require authentication (getCurrentUser)", () => {
      expect(trendRoute).toContain("getCurrentUser");
      expect(actionProgressRoute).toContain("getCurrentUser");
    });

    it("neither route uses Clerk", () => {
      expect(trendRoute).not.toContain("Clerk");
      expect(trendRoute).not.toContain("@clerk");
      expect(actionProgressRoute).not.toContain("Clerk");
      expect(actionProgressRoute).not.toContain("@clerk");
    });
  });
});
