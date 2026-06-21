import { and, eq, sql } from "drizzle-orm";
import { db, setRlsContext } from "@/db/client";
import { webhookEndpoints } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";

const EVENT_NAME_MAP: Record<string, string> = {
  "audit.complete": "audit.completed",
  "drift.detected": "drift.detected",
  "recommendation.created": "recommendation.created",
};

export const fanoutWebhooksFn = inngest.createFunction(
  { id: "fanout-webhooks", triggers: [
    { event: "audit.complete" },
    { event: "drift.detected" },
    { event: "recommendation.created" },
  ] },
  async ({ event, step }: { event: { name: string; data: { organizationId?: string; brandId?: string; auditId?: string } }; step: any }) => {
    const { organizationId } = event.data;
    if (!organizationId) return { skipped: true, reason: "no_org_id" };

    const deliveryEventName = EVENT_NAME_MAP[event.name];
    if (!deliveryEventName) return { skipped: true, reason: "unmapped_event" };

    const endpoints = await step.run("load-endpoints", async () => {
      await setRlsContext(db, organizationId);
      return db
        .select()
        .from(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.organizationId, organizationId),
            eq(webhookEndpoints.isActive, true),
            sql`${deliveryEventName} = ANY(${webhookEndpoints.events})`,
          ),
        );
    });

    if (endpoints.length === 0) return { skipped: true, reason: "no_matching_endpoints" };

    await inngest.send(
      endpoints.map((ep: { id: string }) => ({
        name: "webhook.deliver" as const,
        data: {
          endpointId: ep.id,
          eventName: deliveryEventName,
          payload: event.data,
          organizationId,
        },
      })),
    );

    return { delivered: endpoints.length };
  },
);
