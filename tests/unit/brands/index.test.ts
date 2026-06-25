import { describe, expect, it } from "vitest";
import type { Organization } from "@/db/schema";
import { checkBrandLimit, inheritRegion, TIER_BRAND_LIMITS } from "@/lib/brands";

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-1",
    clerkOrgId: "clerk_org_1",
    name: "Test Org",
    slug: null,
    region: "au",
    tier: "free",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionCancelledAt: null,
    onboardingComplete: false,
    ga4MeasurementId: null,
    ga4ApiSecret: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe("inheritRegion", () => {
  it("returns the org region", () => {
    expect(inheritRegion(makeOrg({ region: "au" }))).toBe("au");
  });

  it("returns uk when org is uk", () => {
    expect(inheritRegion(makeOrg({ region: "uk" }))).toBe("uk");
  });
});

describe("checkBrandLimit", () => {
  it("allows first brand on free tier", () => {
    expect(checkBrandLimit(makeOrg({ tier: "free" }), 0)).toBe(true);
  });

  it("rejects second brand on free tier", () => {
    expect(checkBrandLimit(makeOrg({ tier: "free" }), 1)).toBe(false);
  });

  it("allows first brand on starter tier", () => {
    expect(checkBrandLimit(makeOrg({ tier: "starter" }), 0)).toBe(true);
  });

  it("rejects second brand on starter tier", () => {
    expect(checkBrandLimit(makeOrg({ tier: "starter" }), 1)).toBe(false);
  });

  it("allows 5 brands on agency tier", () => {
    expect(checkBrandLimit(makeOrg({ tier: "agency" }), 4)).toBe(true);
  });

  it("rejects 6th brand on agency tier", () => {
    expect(checkBrandLimit(makeOrg({ tier: "agency" }), 5)).toBe(false);
  });

  it("allows 25 brands on agency_pro tier", () => {
    expect(checkBrandLimit(makeOrg({ tier: "agency_pro" }), 24)).toBe(true);
  });

  it("rejects 26th brand on agency_pro tier", () => {
    expect(checkBrandLimit(makeOrg({ tier: "agency_pro" }), 25)).toBe(false);
  });

  it("allows unlimited brands on enterprise tier", () => {
    expect(checkBrandLimit(makeOrg({ tier: "enterprise" }), 1000)).toBe(true);
  });
});

describe("TIER_BRAND_LIMITS", () => {
  it("has correct limits for all tiers", () => {
    expect(TIER_BRAND_LIMITS.free).toBe(1);
    expect(TIER_BRAND_LIMITS.starter).toBe(1);
    expect(TIER_BRAND_LIMITS.growth).toBe(1);
    expect(TIER_BRAND_LIMITS.agency).toBe(5);
    expect(TIER_BRAND_LIMITS.agency_pro).toBe(25);
    expect(TIER_BRAND_LIMITS.enterprise).toBe(Infinity);
  });
});
