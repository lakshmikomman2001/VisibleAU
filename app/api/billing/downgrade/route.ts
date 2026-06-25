import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { stripe } from "@/lib/stripe/client";

export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [sub] = await db
    .select({
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, currentUser.organizationId));

  if (!sub?.stripeSubscriptionId) {
    return NextResponse.json(
      { error: "No active subscription found" },
      { status: 404 },
    );
  }

  try {
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(subscriptions.organizationId, currentUser.organizationId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[billing/downgrade] Failed:", err);
    return NextResponse.json(
      { error: "Failed to schedule downgrade" },
      { status: 500 },
    );
  }
}
