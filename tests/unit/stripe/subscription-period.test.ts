/**
 * Brand-feature locks and pricing claims (8 Nov), part 6 -- the one rule for a subscription's current period
 * (lib/stripe/webhook-handlers/subscription-period.ts). Splice's row held 24 Sep 2026 as both ends after its
 * 24 Oct renewal: the code before 3 Nov read the period off the subscription, where API versions from
 * 2025-03-31 no longer put it, and fell back to "now" for both ends. The rule: the items (the pinned
 * 2026-05-27.dahlia shape), else the subscription itself (an endpoint on an older version); both ends with
 * the end after the start, or nothing -- never "now", never the start.
 */
import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  periodColumns,
  subscriptionPeriod,
} from "@/lib/stripe/webhook-handlers/subscription-period";

const unix = (iso: string) => Date.parse(iso) / 1000;
const SEP_24 = unix("2026-09-24T03:12:00Z");
const OCT_24 = unix("2026-10-24T03:12:00Z");
const NOV_24 = unix("2026-11-24T03:12:00Z");

/** A subscription as the pinned API version (2026-05-27.dahlia) gives it: the period on each item. */
function pinnedShape(items: Array<{ start?: number; end?: number }>): Stripe.Subscription {
  return {
    id: "sub_1PeriodRuleTest0001",
    object: "subscription",
    items: {
      object: "list",
      data: items.map((item, n) => ({
        id: `si_${n}`,
        price: { id: "price_test" },
        current_period_start: item.start,
        current_period_end: item.end,
      })),
    },
  } as unknown as Stripe.Subscription;
}

/** The older shape (before 2025-03-31): the period on the subscription, none on the items. */
function olderShape(start?: number, end?: number): Stripe.Subscription {
  return {
    id: "sub_1PeriodRuleTest0002",
    object: "subscription",
    current_period_start: start,
    current_period_end: end,
    items: { object: "list", data: [{ id: "si_0", price: { id: "price_test" } }] },
  } as unknown as Stripe.Subscription;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("subscriptionPeriod", () => {
  it("reads the period off the item, where the pinned API version keeps it", () => {
    expect(subscriptionPeriod(pinnedShape([{ start: OCT_24, end: NOV_24 }]))).toEqual({
      ok: true,
      start: new Date(OCT_24 * 1000),
      end: new Date(NOV_24 * 1000),
    });
  });

  it("several items: the period they share -- the latest start, the earliest end", () => {
    const later = OCT_24 + 3600;
    const earlier = NOV_24 - 3600;
    expect(
      subscriptionPeriod(
        pinnedShape([
          { start: OCT_24, end: NOV_24 },
          { start: later, end: earlier },
        ]),
      ),
    ).toEqual({ ok: true, start: new Date(later * 1000), end: new Date(earlier * 1000) });
  });

  it("an event from an endpoint on an older API version: the period on the subscription", () => {
    expect(subscriptionPeriod(olderShape(OCT_24, NOV_24))).toEqual({
      ok: true,
      start: new Date(OCT_24 * 1000),
      end: new Date(NOV_24 * 1000),
    });
  });

  it("no period anywhere: missing -- never now, never the start", () => {
    expect(subscriptionPeriod(olderShape())).toEqual({ ok: false, reason: "missing" });
    expect(subscriptionPeriod(pinnedShape([{}]))).toEqual({ ok: false, reason: "missing" });
    expect(subscriptionPeriod(olderShape(OCT_24))).toEqual({ ok: false, reason: "missing" });
    expect(subscriptionPeriod(olderShape(undefined, NOV_24))).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(subscriptionPeriod(olderShape(0, 0))).toEqual({ ok: false, reason: "missing" });
  });

  it("an end not after its start is refused: Splice's 24 Sep to 24 Sep, and one before its start", () => {
    expect(subscriptionPeriod(pinnedShape([{ start: SEP_24, end: SEP_24 }]))).toEqual({
      ok: false,
      reason: "end_not_after_start",
    });
    expect(subscriptionPeriod(olderShape(NOV_24, OCT_24))).toEqual({
      ok: false,
      reason: "end_not_after_start",
    });
  });
});

describe("periodColumns", () => {
  it("both columns when the period is usable, and no warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      periodColumns(pinnedShape([{ start: OCT_24, end: NOV_24 }]), {
        stripeEventId: "evt_1",
        type: "customer.subscription.updated",
      }),
    ).toEqual({
      currentPeriodStart: new Date(OCT_24 * 1000),
      currentPeriodEnd: new Date(NOV_24 * 1000),
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("neither column otherwise -- what's stored stays -- and a warning naming no customer or subscription", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      periodColumns(pinnedShape([{ start: SEP_24, end: SEP_24 }]), {
        stripeEventId: "evt_2",
        type: "customer.subscription.updated",
      }),
    ).toEqual({});
    expect(periodColumns(olderShape(), { route: "billing/downgrade" })).toEqual({});

    const lines = warn.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(lines).toEqual([
      {
        event: "stripe_subscription_period_not_stored",
        reason: "end_not_after_start",
        items: 1,
        stripeEventId: "evt_2",
        type: "customer.subscription.updated",
      },
      {
        event: "stripe_subscription_period_not_stored",
        reason: "missing",
        items: 1,
        route: "billing/downgrade",
      },
    ]);
    expect(JSON.stringify(lines)).not.toMatch(/sub_|cus_/);
  });
});
