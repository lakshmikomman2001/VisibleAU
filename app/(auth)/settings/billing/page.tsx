import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withRlsContext } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { publicGoogleAi, resolveGoogleSurfaces } from "@/lib/governance/google-surfaces";
import { googleAiLockedMessage, googleAiPlanLine } from "@/lib/marketing/google-ai";
import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import { tierOfSubscription } from "@/lib/pricing/effective-tier";
import { formatAud } from "@/lib/pricing/gst";
import { workspaceNeedsPlan } from "@/lib/pricing/plan-required";
import { renewalLine } from "@/lib/pricing/renewal";
import {
  GOOGLE_AI_FROM_TIER,
  getTierDefinition,
  tierDisplayName,
  tierRank,
} from "@/lib/pricing/tiers";
import { TIER_AUDIT_LIMITS } from "@/lib/scheduling/tier-limits";
import BillingView, { type BillingGoogleAi } from "./billing-view";

/**
 * 16 Nov (Sri: Google's AI answers on for Growth and up): what this plan says about them, from lib/pricing/tiers.ts's
 * line. On when this workspace's next audit would run them (resolveGoogleSurfaces: the global setting, its own override,
 * the plan); below Growth, while the global setting has them on, the plan that has them; otherwise nothing. A failed
 * read says nothing rather than guess.
 */
async function billingGoogleAi(
  organizationId: string,
  planTier: string,
): Promise<BillingGoogleAi | null> {
  try {
    const resolved = await resolveGoogleSurfaces(organizationId, { tier: planTier });
    if (resolved.surfaces.length > 0) {
      return { kind: "included", text: googleAiPlanLine(resolved.surfaces) };
    }
    if (tierRank(planTier) >= tierRank(GOOGLE_AI_FROM_TIER)) return null;
    const offered = await publicGoogleAi();
    return offered ? { kind: "locked", text: googleAiLockedMessage(offered) } : null;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "billing_google_ai_unread",
        error: err instanceof Error ? err.name : "unknown",
      }),
    );
    return null;
  }
}

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
  const googleAi = await billingGoogleAi(currentUser.organizationId, tier);

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
      googleAi={googleAi}
      planRequired={
        await withRlsContext(currentUser.organizationId, (tx) =>
          workspaceNeedsPlan(tx, currentUser.organizationId),
        )
      }
    />
  );
}
