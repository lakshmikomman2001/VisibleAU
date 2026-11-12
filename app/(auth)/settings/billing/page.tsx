import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withRlsContext } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import { tierOfSubscription } from "@/lib/pricing/effective-tier";
import { formatAud } from "@/lib/pricing/gst";
import { renewalLine } from "@/lib/pricing/renewal";
import { getTierDefinition, tierDisplayName } from "@/lib/pricing/tiers";
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

  const [sub] = await withRlsContext(currentUser.organizationId, (tx) =>
    tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId)),
  );
  const tier = tierOfSubscription(sub);
  // A subscription that has ended leaves nothing to manage: this is a free workspace.
  const liveSub = tier === "free" ? null : sub;
  const tierDef = getTierDefinition(tier);
  // Live invite test follow-ups (8 Nov), part 3: one rule for the renewal line -- a past date is never the
  // "Next renewal", and a plan Stripe doesn't renew says so (lib/pricing/renewal.ts).
  const renewal = renewalLine(liveSub ?? null, (date) =>
    formatInOrgTimezone(date, undefined, "d MMM yyyy"),
  );

  const limits =
    TIER_AUDIT_LIMITS[tier as keyof typeof TIER_AUDIT_LIMITS] ?? TIER_AUDIT_LIMITS.free;

  return (
    <BillingView
      tier={tier}
      tierName={tierDisplayName(tier)}
      monthlyPrice={tierDef ? formatAud(tierDef.monthlyPriceCentsIncGst) : "A$0"}
      billingInterval={liveSub?.billingInterval ?? "monthly"}
      cancelAtPeriodEnd={liveSub?.cancelAtPeriodEnd ?? false}
      renewal={renewal}
      hasSubscription={!!liveSub}
      stripeCustomerId={sub?.stripeCustomerId ?? null}
      maxScheduled={limits.maxScheduled}
      frequency={limits.frequency}
      success={params.success === "true"}
      reason={params.reason ?? null}
    />
  );
}
