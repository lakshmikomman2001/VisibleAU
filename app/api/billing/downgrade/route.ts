import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serviceDb } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEndedSubscriptionStatus } from "@/lib/pricing/effective-tier";
import { getStripe } from "@/lib/stripe/client";
import { subscriptionPeriod } from "@/lib/stripe/webhook-handlers/subscription-period";

export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [sub] = await serviceDb
    .select({
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, currentUser.organizationId));

  if (!sub?.stripeSubscriptionId || isEndedSubscriptionStatus(sub.status)) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
  }

  try {
    const updated = await getStripe().subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    // The plan lasts until this period's end (lib/pricing/effective-tier.ts), so
    // it's written with the flag, not left to the webhook that follows.
    const { start, end } = subscriptionPeriod(updated);

    await serviceDb
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: true,
        ...(start && { currentPeriodStart: start }),
        ...(end && { currentPeriodEnd: end }),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, currentUser.organizationId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[billing/downgrade] Failed:", err);
    return NextResponse.json({ error: "Failed to schedule downgrade" }, { status: 500 });
  }
}
