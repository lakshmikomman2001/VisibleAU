/**
 * 3 Nov -- lib/pricing/tiers.ts is the one place that says which plan has what.
 * These check that what the server enforces and what the pricing page prints can't
 * drift apart: each feature's plan lists it in its own words, and the comparison
 * table marks the same plans.
 */
import { describe, expect, it } from "vitest";
import { COMPARISON_ROWS } from "@/components/domain/pricing/tier-comparison-table";
import { isTierAtLeast, TIER_SEAT_LIMITS } from "@/lib/brands";
import {
  type PlanFeature,
  requiredTierFor,
  seatLimitFor,
  seatLimitMessage,
  TIER_DEFINITIONS,
} from "@/lib/pricing/tiers";

/** The words each plan's list uses for a feature. */
const LABEL: Record<PlanFeature, string> = {
  client_portal: "Client portal",
  white_label_reports: "White-label reports",
  webhooks: "Webhook integrations",
  bulk_operations: "Bulk operations",
  ga4: "GA4 integration",
};

const FEATURES = Object.keys(LABEL) as PlanFeature[];

describe("which plan has what", () => {
  it.each([
    ["client_portal", "agency", "Agency"],
    ["white_label_reports", "agency", "Agency"],
    ["webhooks", "agency", "Agency"],
    ["bulk_operations", "agency_pro", "Agency Pro"],
    ["ga4", "agency_pro", "Agency Pro"],
  ] as const)("%s starts at %s", (feature, key, name) => {
    expect(requiredTierFor(feature).key).toBe(key);
    expect(requiredTierFor(feature).name).toBe(name);
  });

  it.each(FEATURES)("%s: the plan that unlocks it prints it on the pricing page", (feature) => {
    expect(requiredTierFor(feature).features).toContain(LABEL[feature]);
  });

  it("no plan unlocks a feature it doesn't print", () => {
    for (const tier of TIER_DEFINITIONS) {
      for (const feature of tier.unlocks) expect(tier.features).toContain(LABEL[feature]);
    }
  });

  it.each(
    FEATURES.filter((f) => f !== "bulk_operations"),
  )("%s: the comparison table marks exactly the plans at or above it", (feature) => {
    const row = COMPARISON_ROWS.find((r) => r.label === LABEL[feature]);
    expect(row).toBeDefined();
    const marked = row && "tiers" in row ? [...row.tiers] : [];
    const expected = TIER_DEFINITIONS.map((t) => t.key).filter((key) =>
      isTierAtLeast(key, requiredTierFor(feature).key),
    );
    expect(marked.sort()).toEqual(expected.sort());
  });
});

describe("seats", () => {
  it.each([
    ["free", 1],
    ["starter", 1],
    ["growth", 1],
    ["agency", 5],
    ["agency_pro", 15],
  ])("%s has %i", (tier, seats) => {
    expect(seatLimitFor(tier)).toBe(seats);
    expect(TIER_SEAT_LIMITS[tier]).toBe(seats);
  });

  it("enterprise has no limit, and a tier nobody knows has one seat", () => {
    expect(seatLimitFor("enterprise")).toBe(Number.POSITIVE_INFINITY);
    expect(TIER_SEAT_LIMITS.enterprise).toBe(Number.POSITIVE_INFINITY);
    expect(seatLimitFor("something-else")).toBe(1);
  });

  it("says how many, in the singular for one", () => {
    expect(seatLimitMessage(1)).toBe("Your plan includes 1 seat");
    expect(seatLimitMessage(5)).toBe("Your plan includes 5 seats");
  });
});
