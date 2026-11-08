/**
 * Mock-gate and retention follow-ups (9 Nov), part 8 -- Stripe's scheduled cancellation date (cancel_at), in the two
 * rules that read a subscription: the billing line says when the plan ends, and the plan lasts until then (a lost
 * customer.subscription.deleted can't keep it for ever). Without a date, both are as they were.
 * tests/integration/stripe-cancel-at.integration.test.ts proves the same from Stripe's events.
 */
import { describe, expect, it } from "vitest";
import { tierOfSubscription } from "@/lib/pricing/effective-tier";
import { renewalLine } from "@/lib/pricing/renewal";

const NOV_9 = new Date("2026-11-09T09:00:00Z");
const NOV_24 = new Date("2026-11-24T03:12:00Z");
const DEC_23 = new Date("2026-12-23T03:12:00Z");
const day = (d: Date) => d.toISOString().slice(0, 10);
const row = (cancelAt: Date | null) => ({
  tier: "agency_pro",
  status: "active",
  cancelAtPeriodEnd: false,
  cancelAt,
  currentPeriodStart: new Date("2026-10-24T03:12:00Z"),
  currentPeriodEnd: NOV_24,
  stripeSubscriptionId: "sub_1CancelAtUnitTest",
});

describe("a cancellation Stripe scheduled for a date", () => {
  it("the billing line: 'Plan ends <date>', then 'Plan ended <date>'; without one, the next renewal", () => {
    expect(renewalLine(row(DEC_23), day, NOV_9)).toMatchObject({
      label: "Plan ends",
      value: "2026-12-23",
    });
    expect(renewalLine(row(DEC_23), day, new Date("2026-12-24T00:00:00Z"))).toMatchObject({
      label: "Plan ended",
      value: "2026-12-23",
    });
    expect(renewalLine(row(null), day, NOV_9)).toMatchObject({
      label: "Next renewal",
      value: "2026-11-24",
    });
  });

  it("the plan lasts until the date, and not past it if the deletion event never comes", () => {
    expect(tierOfSubscription(row(DEC_23), NOV_9)).toBe("agency_pro");
    expect(tierOfSubscription(row(DEC_23), new Date("2026-12-23T03:13:00Z"))).toBe("free");
    expect(tierOfSubscription(row(null), NOV_9)).toBe("agency_pro");
  });
});
