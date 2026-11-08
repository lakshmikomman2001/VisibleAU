import { and, eq, inArray } from "drizzle-orm";
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
  /** Stripe's scheduled cancellation date (migration 0144): the plan until then. */
  cancelAt?: Date | null;
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
  // 9 Nov (part 8): a cancellation Stripe scheduled for a date keeps the plan until that date, like a period
  // end; customer.subscription.deleted makes it final, and the date stops a lost event keeping it for ever.
  if (sub.cancelAt && sub.cancelAt.getTime() <= now.getTime()) return FREE_TIER;
  return sub.tier;
}

/** What the rule reads. For a job choosing across workspaces, to select alongside its own columns. */
export const subscriptionPlanColumns = {
  tier: subscriptions.tier,
  status: subscriptions.status,
  cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
  cancelAt: subscriptions.cancelAt,
  currentPeriodStart: subscriptions.currentPeriodStart,
  currentPeriodEnd: subscriptions.currentPeriodEnd,
};

/** Whether this subscription still gives a paid plan, by the rule every gate reads. */
export function hasPaidPlan(sub: SubscriptionPlan, now: Date = new Date()): boolean {
  return tierOfSubscription(sub, now) !== FREE_TIER;
}

/**
 * Sri, 8 Nov (team follow-ups, decision 9) -- Stripe's statuses of a subscription that hasn't been cancelled:
 * still billing, or about to. Not the plan rule above (past_due and unpaid keep the plan there too, but a
 * scheduled cancellation still counts here until Stripe ends it): a workspace's only owner can't switch away
 * from a workspace with one (lib/auth/invite.ts onlyOwnerCantLeave).
 */
export const UNCANCELLED_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
] as const;

/** Whether the workspace has a subscription that isn't cancelled (UNCANCELLED_SUBSCRIPTION_STATUSES). */
export async function hasUncancelledSubscription(
  db: DbClient,
  organizationId: string,
): Promise<boolean> {
  const [sub] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        inArray(subscriptions.status, [...UNCANCELLED_SUBSCRIPTION_STATUSES]),
      ),
    )
    .limit(1);
  return sub !== undefined;
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
