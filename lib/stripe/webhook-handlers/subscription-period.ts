import type Stripe from "stripe";

/**
 * 3 Nov -- a subscription's current period. From API version 2025-03-31 it's on
 * the subscription item, and it's no longer on the subscription, where this code
 * used to read it: the checkout handler fell back to the checkout's own time for
 * both ends, and a webhook left the end unchanged. The API calls here use this
 * SDK's version; a webhook endpoint keeps the version it was created with, so an
 * event may still carry the old shape.
 */
interface OldShape {
  current_period_start?: number;
  current_period_end?: number;
}

function fromUnix(seconds: number | undefined): Date | undefined {
  return seconds ? new Date(seconds * 1000) : undefined;
}

export function subscriptionPeriod(sub: Stripe.Subscription): { start?: Date; end?: Date } {
  const item: OldShape | undefined = sub.items?.data?.[0];
  const old = sub as unknown as OldShape;
  return {
    start: fromUnix(item?.current_period_start ?? old.current_period_start),
    end: fromUnix(item?.current_period_end ?? old.current_period_end),
  };
}
