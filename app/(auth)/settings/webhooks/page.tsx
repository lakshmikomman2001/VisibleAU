import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { WebhooksSettingsView } from "@/components/domain/webhooks/webhooks-settings-view";
import { withRlsContext } from "@/db/client";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { VALID_EVENTS } from "@/lib/webhooks/events";

export default async function WebhooksSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { endpoints, recentDeliveries } = await withRlsContext(currentUser.organizationId, async (tx) => {
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

    return { endpoints, recentDeliveries };
  });

  return (
    <WebhooksSettingsView
      endpoints={endpoints}
      recentDeliveries={recentDeliveries}
      validEvents={[...VALID_EVENTS]}
    />
  );
}
