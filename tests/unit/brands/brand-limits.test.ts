/**
 * 6 Nov (phone-layout follow-ups, item 1) -- lib/brands/limits.ts: the brand limit
 * every "New brand" entry reads is POST /api/brands's own (checkBrandLimit), its
 * figures are the pricing page's (lib/pricing/tiers.ts), and at the limit it names
 * the first plan up with more brands.
 */
import { describe, expect, it } from "vitest";
import { checkBrandLimit as apiCheck, TIER_BRAND_LIMITS as apiLimits } from "@/lib/brands";
import { brandUsage, checkBrandLimit, TIER_BRAND_LIMITS } from "@/lib/brands/limits";
import { TIER_DEFINITIONS } from "@/lib/pricing/tiers";

describe("brand limits", () => {
  it("are the pricing page's figures, -1 being unlimited", () => {
    for (const tier of TIER_DEFINITIONS) {
      expect(TIER_BRAND_LIMITS[tier.key], tier.key).toBe(tier.brands < 0 ? Infinity : tier.brands);
    }
    expect(TIER_BRAND_LIMITS).toEqual({
      free: 1,
      starter: 1,
      growth: 1,
      agency: 5,
      agency_pro: 25,
      enterprise: Infinity,
    });
  });

  it("the API's check is this one", () => {
    expect(apiCheck).toBe(checkBrandLimit);
    expect(apiLimits).toBe(TIER_BRAND_LIMITS);
  });

  it("brandUsage says what the API would: room until the limit, none at it", () => {
    for (const tier of TIER_DEFINITIONS) {
      for (const count of [0, 1, 4, 5, 24, 25, 1000]) {
        expect(brandUsage(tier.key, count).canAdd, `${tier.key} ${count}`).toBe(
          checkBrandLimit(tier.key, count),
        );
      }
    }
  });

  it("at the limit: the first plan up with more brands", () => {
    expect(brandUsage("free", 1)).toEqual({
      count: 1,
      limit: 1,
      canAdd: false,
      upgradePlan: "Agency",
    });
    expect(brandUsage("growth", 1).upgradePlan).toBe("Agency");
    expect(brandUsage("agency", 5).upgradePlan).toBe("Agency Pro");
    expect(brandUsage("agency_pro", 25).upgradePlan).toBe("Enterprise");
  });

  it("with room, or no limit at all: no upgrade to name", () => {
    expect(brandUsage("agency", 2)).toEqual({
      count: 2,
      limit: 5,
      canAdd: true,
      upgradePlan: null,
    });
    expect(brandUsage("enterprise", 500)).toEqual({
      count: 500,
      limit: null,
      canAdd: true,
      upgradePlan: null,
    });
  });

  it("a plan nobody knows gets one brand, as the API gives it", () => {
    expect(brandUsage("mystery", 0).canAdd).toBe(true);
    expect(brandUsage("mystery", 1)).toMatchObject({ limit: 1, canAdd: false });
  });
});
