import { eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { subscriptions } from "@/db/schema/subscriptions";

/**
 * 3 Nov ("A cancelled plan must stop granting paid features everywhere") -- the
 * plan a workspace has the use of today, and the only place that reads the plan
 * off a subscription row (tests/unit/pricing/effective-tier-guard.test.ts).
 *
 * Deleting a subscription leaves subscriptions.tier as it was: only the status
 * changes, and every gate used to read the tier alone, so a cancelled Agency
 * workspace kept the Agency Dashboard and everything else. A helper rather than
 * resetting the column on deletion, so no gate can forget and so workspaces
 * already cancelled need no data fix.
 *
 * - No subscription: free.
 * - Ended (Stripe's two terminal statuses): free.
 * - Cancellation scheduled: the plan, until the period ends. Stripe's
 *   customer.subscription.deleted makes it final, and the period end stops a
 *   lost event from keeping the plan for ever.
 * - Anything else, past_due and unpaid included: the plan. Unchanged, and Sri's
 *   decision to make.
 */
export const ENDED_SUBSCRIPTION_STATUSES = ["canceled", "incomplete_expired"] as const;

const FREE_TIER = "free";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionPlan {
  tier: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
}

/** Stripe never brings these back: paying again is a new subscription. */
export function isEndedSubscriptionStatus(status: string): boolean {
  return (ENDED_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether a scheduled cancellation's period is over. Until 3 Nov the checkout
 * handler stored the checkout's time as both ends of the period (this Stripe API
 * version keeps the period on the subscription item, not where it looked). A
 * period under a day isn't a real one, so that row waits for Stripe rather than
 * losing a plan its owner has paid for.
 */
function cancelledPeriodIsOver(sub: SubscriptionPlan, now: Date): boolean {
  if (!sub.cancelAtPeriodEnd || !sub.currentPeriodEnd) return false;
  const end = sub.currentPeriodEnd.getTime();
  if (sub.currentPeriodStart && end - sub.currentPeriodStart.getTime() < ONE_DAY_MS) return false;
  return end <= now.getTime();
}

export function tierOfSubscription(
  sub: SubscriptionPlan | null | undefined,
  now: Date = new Date(),
): string {
  if (!sub) return FREE_TIER;
  if (isEndedSubscriptionStatus(sub.status)) return FREE_TIER;
  if (cancelledPeriodIsOver(sub, now)) return FREE_TIER;
  return sub.tier;
}

/** What the rule reads. For a job choosing across workspaces, to select alongside its own columns. */
export const subscriptionPlanColumns = {
  tier: subscriptions.tier,
  status: subscriptions.status,
  cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
  currentPeriodStart: subscriptions.currentPeriodStart,
  currentPeriodEnd: subscriptions.currentPeriodEnd,
};

/** Whether this subscription still gives a paid plan, by the rule every gate reads. */
export function hasPaidPlan(sub: SubscriptionPlan, now: Date = new Date()): boolean {
  return tierOfSubscription(sub, now) !== FREE_TIER;
}

/** The workspace's plan as every gate must see it. `db` is whichever client or transaction the caller holds. */
export async function effectiveTier(db: DbClient, organizationId: string): Promise<string> {
  const [sub] = await db
    .select(subscriptionPlanColumns)
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  return tierOfSubscription(sub);
}
