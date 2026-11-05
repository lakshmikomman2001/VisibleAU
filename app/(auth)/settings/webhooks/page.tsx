import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PlanLockedPage } from "@/components/domain/pricing/plan-lock";
import { WebhooksSettingsView } from "@/components/domain/webhooks/webhooks-settings-view";
import { withRlsContext } from "@/db/client";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { workspaceHasFeature } from "@/lib/pricing/plan-features";
import { PLAN_FEATURE_COPY } from "@/lib/pricing/tiers";
import { VALID_EVENTS } from "@/lib/webhooks/events";

/**
 * Webhooks are Agency and up (lib/pricing/tiers.ts). On any other plan this is the
 * locked card, checked here the way /api/webhooks-config checks it, so nobody gets as
 * far as its 403. Endpoints set up before stay listed and can still be deleted (that
 * route is open on every plan); nothing is sent to them.
 */
export default async function WebhooksSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { onPlan, endpoints, recentDeliveries } = await withRlsContext(
    currentUser.organizationId,
    async (tx) => {
      const onPlan = await workspaceHasFeature(tx, currentUser.organizationId, "webhooks");
      const endpoints = await tx
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.organizationId, currentUser.organizationId))
        .orderBy(desc(webhookEndpoints.createdAt));

      const recentDeliveries = await tx
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.organizationId, currentUser.organizationId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(20);

      return { onPlan, endpoints, recentDeliveries };
    },
  );

  if (!onPlan) {
    return (
      <PlanLockedPage
        title="Webhooks"
        feature="webhooks"
        description={
          endpoints.length > 0
            ? `${PLAN_FEATURE_COPY.webhooks.description}. Nothing is sent to the endpoints below on this plan, and you can still delete them.`
            : undefined
        }
      >
        {endpoints.length > 0 && (
          <WebhooksSettingsView
            locked
            endpoints={endpoints}
            recentDeliveries={[]}
            validEvents={[...VALID_EVENTS]}
          />
        )}
      </PlanLockedPage>
    );
  }

  return (
    <WebhooksSettingsView
      endpoints={endpoints}
      recentDeliveries={recentDeliveries}
      validEvents={[...VALID_EVENTS]}
    />
  );
}
