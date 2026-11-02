/**
 * 3 Nov ("A cancelled plan must stop granting paid features everywhere") -- the
 * rule every plan gate now reads, one row at a time.
 */
import { describe, expect, it } from "vitest";
import { isEndedSubscriptionStatus, tierOfSubscription } from "@/lib/pricing/effective-tier";

const NOW = new Date("2026-11-03T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY);

function row(over: Partial<Parameters<typeof tierOfSubscription>[0] & object> = {}) {
  return {
    tier: "agency",
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodStart: daysFromNow(-20),
    currentPeriodEnd: daysFromNow(10),
    ...over,
  };
}

describe("tierOfSubscription", () => {
  it("no subscription is free", () => {
    expect(tierOfSubscription(undefined, NOW)).toBe("free");
    expect(tierOfSubscription(null, NOW)).toBe("free");
  });

  it.each([
    "starter",
    "growth",
    "agency",
    "agency_pro",
    "enterprise",
  ])("a live %s plan is that plan", (tier) => {
    expect(tierOfSubscription(row({ tier }), NOW)).toBe(tier);
  });

  it.each([
    "canceled",
    "incomplete_expired",
  ])("a subscription that's %s is free, whatever tier the row still says", (status) => {
    expect(tierOfSubscription(row({ status }), NOW)).toBe("free");
  });

  it("a scheduled cancellation keeps the plan until the period ends", () => {
    const scheduled = row({ cancelAtPeriodEnd: true, currentPeriodEnd: daysFromNow(10) });
    expect(tierOfSubscription(scheduled, NOW)).toBe("agency");
    expect(tierOfSubscription(scheduled, daysFromNow(9))).toBe("agency");
  });

  it("once that period has ended the plan has too, even if Stripe's event hasn't arrived", () => {
    const scheduled = row({ cancelAtPeriodEnd: true, currentPeriodEnd: daysFromNow(10) });
    expect(tierOfSubscription(scheduled, daysFromNow(10))).toBe("free");
    expect(tierOfSubscription(scheduled, daysFromNow(11))).toBe("free");
  });

  it("a period end in the past means nothing without a scheduled cancellation: renewal is Stripe's", () => {
    expect(tierOfSubscription(row({ currentPeriodEnd: daysFromNow(-3) }), NOW)).toBe("agency");
  });

  it("a scheduled cancellation with no period end keeps the plan until Stripe says otherwise", () => {
    expect(tierOfSubscription(row({ cancelAtPeriodEnd: true, currentPeriodEnd: null }), NOW)).toBe(
      "agency",
    );
  });

  it("a period the old checkout handler wrote (start and end both the checkout's time) is not a period", () => {
    // Before 3 Nov, checkout-completed read current_period_end off the
    // subscription, where this API version no longer has it, and fell back to
    // new Date() for both: a customer must not lose the plan they paid for
    // the moment they schedule a cancellation.
    const checkoutTime = daysFromNow(-5);
    expect(
      tierOfSubscription(
        row({
          cancelAtPeriodEnd: true,
          currentPeriodStart: checkoutTime,
          currentPeriodEnd: new Date(checkoutTime.getTime() + 1),
        }),
        NOW,
      ),
    ).toBe("agency");
  });

  describe("not changed (a decision for Sri): the plan stays while Stripe hasn't ended it", () => {
    it.each([
      "past_due",
      "unpaid",
      "paused",
      "incomplete",
      "trialing",
    ])("%s keeps the plan", (status) => {
      expect(tierOfSubscription(row({ status }), NOW)).toBe("agency");
    });
  });

  it("an ended status wins over everything else on the row", () => {
    expect(
      tierOfSubscription(
        row({ status: "canceled", cancelAtPeriodEnd: true, currentPeriodEnd: daysFromNow(10) }),
        NOW,
      ),
    ).toBe("free");
  });
});

describe("isEndedSubscriptionStatus", () => {
  it("is true only for Stripe's two terminal statuses", () => {
    expect(isEndedSubscriptionStatus("canceled")).toBe(true);
    expect(isEndedSubscriptionStatus("incomplete_expired")).toBe(true);
    for (const status of ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]) {
      expect(isEndedSubscriptionStatus(status)).toBe(false);
    }
  });
});
