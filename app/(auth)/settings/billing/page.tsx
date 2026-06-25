import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getTierDefinition } from "@/lib/pricing/tiers";
import { formatAud } from "@/lib/pricing/gst";
import { TIER_AUDIT_LIMITS } from "@/lib/scheduling/tier-limits";
import BillingView from "./billing-view";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; reason?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const params = await searchParams;
  const tier = currentUser.organization.tier ?? "free";
  const tierDef = getTierDefinition(tier);

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, currentUser.organizationId));

  const limits =
    TIER_AUDIT_LIMITS[tier as keyof typeof TIER_AUDIT_LIMITS] ?? TIER_AUDIT_LIMITS.free;

  return (
    <BillingView
      tier={tier}
      tierName={tierDef?.name ?? tier}
      monthlyPrice={tierDef ? formatAud(tierDef.monthlyPriceCentsIncGst) : "A$0"}
      billingInterval={sub?.billingInterval ?? "monthly"}
      cancelAtPeriodEnd={sub?.cancelAtPeriodEnd ?? false}
      periodEnd={sub?.currentPeriodEnd?.toISOString() ?? null}
      hasSubscription={!!sub}
      stripeCustomerId={sub?.stripeCustomerId ?? null}
      maxScheduled={limits.maxScheduled}
      frequency={limits.frequency}
      success={params.success === "true"}
      reason={params.reason ?? null}
    />
  );
}
