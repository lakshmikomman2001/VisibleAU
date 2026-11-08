import type Stripe from "stripe";

/**
 * A subscription's current period: the one rule every writer of subscriptions.current_period_start and
 * current_period_end goes through (checkout, customer.subscription.updated, the downgrade route).
 *
 * 3 Nov -- from API version 2025-03-31 the period is on each subscription item, and no longer on the
 * subscription, where this code used to read it: the checkout handler fell back to the checkout's own time
 * for both ends, and a webhook left the end unchanged.
 *
 * 8 Nov (brand-feature locks and pricing claims, part 6) -- Splice's row still held 24 Sep as both ends after
 * its 24 Oct renewal: what the code before 3 Nov left, with no subscription event since to replace it. So:
 * - Where the period is. API calls use this SDK's own version, 2026-05-27.dahlia (stripe 22.2.0;
 *   lib/stripe/client.ts sets no apiVersion), which keeps it on the items. A webhook endpoint renders its
 *   events in the version set on the endpoint in Stripe's dashboard (nothing in this code), so an event may
 *   still carry the older shape, on the subscription itself: the items, else that.
 * - Several items: the period they all share, the latest start and the earliest end, as Stripe's own
 *   subscription list filters read it.
 * - Both ends, with the end after the start, or nothing. A missing end is never written as a date, nor as
 *   "now" or the start: the caller keeps what's stored, and a warning says why (periodColumns).
 */
interface OldShape {
  current_period_start?: number | null;
  current_period_end?: number | null;
}

export type SubscriptionPeriod =
  | { ok: true; start: Date; end: Date }
  | { ok: false; reason: "missing" | "end_not_after_start" };

const isSeconds = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

function periodSeconds(sub: Stripe.Subscription): { start?: number; end?: number } {
  const items: OldShape[] = sub.items?.data ?? [];
  const starts = items.map((item) => item.current_period_start).filter(isSeconds);
  const ends = items.map((item) => item.current_period_end).filter(isSeconds);
  if (items.length > 0 && starts.length === items.length && ends.length === items.length) {
    return { start: Math.max(...starts), end: Math.min(...ends) };
  }
  const old = sub as unknown as OldShape;
  return {
    start: isSeconds(old.current_period_start) ? old.current_period_start : undefined,
    end: isSeconds(old.current_period_end) ? old.current_period_end : undefined,
  };
}

export function subscriptionPeriod(sub: Stripe.Subscription): SubscriptionPeriod {
  const { start, end } = periodSeconds(sub);
  if (start === undefined || end === undefined) return { ok: false, reason: "missing" };
  if (end <= start) return { ok: false, reason: "end_not_after_start" };
  return { ok: true, start: new Date(start * 1000), end: new Date(end * 1000) };
}

/** Where a subscription came from, for the warning: a Stripe event, or one of this app's routes. */
export type PeriodSource = { stripeEventId: string; type: string } | { route: string };

/**
 * The period columns to write for `sub`: both ends, or neither, so what's stored stays. With neither, a
 * warning gives the reason and where the subscription came from (an event's id and type, or the route),
 * never a customer or subscription.
 */
export function periodColumns(
  sub: Stripe.Subscription,
  source: PeriodSource,
): { currentPeriodStart?: Date; currentPeriodEnd?: Date } {
  const period = subscriptionPeriod(sub);
  if (period.ok) return { currentPeriodStart: period.start, currentPeriodEnd: period.end };
  console.warn(
    JSON.stringify({
      event: "stripe_subscription_period_not_stored",
      reason: period.reason,
      items: sub.items?.data?.length ?? 0,
      ...source,
    }),
  );
  return {};
}
