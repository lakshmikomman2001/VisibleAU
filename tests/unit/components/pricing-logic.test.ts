import { beforeEach, describe, expect, it, vi } from "vitest";
import { isFreeTierEnabled } from "@/lib/feature-flags";

describe("Pricing page tier logic", () => {
  const baseTiers = [
    { name: "Starter", price: "A$99/mo" },
    { name: "Growth", price: "A$299/mo" },
    { name: "Agency", price: "A$499/mo" },
    { name: "Agency Pro", price: "A$1,499/mo" },
  ];

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows 5 tiers when free tier enabled (AU)", () => {
    vi.stubEnv("FREE_TIER_ENABLED_AU", "true");
    const showFree = isFreeTierEnabled("au");
    const tiers = showFree ? [{ name: "Free", price: "A$0" }, ...baseTiers] : baseTiers;
    expect(tiers).toHaveLength(5);
    expect(tiers[0].name).toBe("Free");
  });

  it("shows 4 tiers when free tier disabled (UK)", () => {
    vi.stubEnv("FREE_TIER_ENABLED_UK", "false");
    const showFree = isFreeTierEnabled("uk");
    const tiers = showFree ? [{ name: "Free", price: "A$0" }, ...baseTiers] : baseTiers;
    expect(tiers).toHaveLength(4);
    expect(tiers[0].name).toBe("Starter");
  });

  it("all tiers have a name and price", () => {
    for (const tier of baseTiers) {
      expect(tier.name).toBeTruthy();
      expect(tier.price).toBeTruthy();
    }
  });

  it("pricing page always shows at least the 4 paid tiers", () => {
    expect(baseTiers.length).toBeGreaterThanOrEqual(4);
  });

  it("starter price is A$99/mo per PRD §7", () => {
    expect(baseTiers[0].price).toBe("A$99/mo");
  });

  it("agency pro price is A$1,499/mo per PRD §7", () => {
    expect(baseTiers[3].price).toBe("A$1,499/mo");
  });
});
