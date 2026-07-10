import { and, eq, sql } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { serviceDb } from "@/db/client";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";

const EVENT_NAME_MAP: Record<string, string> = {
  "audit.complete": "audit.completed",
  "drift.detected": "drift.detected",
  "recommendation.created": "recommendation.created",
  "report/generated": "report.generated",
  "hallucination/detected": "hallucination.detected",
  "hallucination/acknowledged": "hallucination.acknowledged",
  "visibility/trend-updated": "visibility.trend.updated",
  "agent/readiness-scored": "agent.readiness.scored",
};

export const fanoutWebhooksFn = inngest.createFunction(
  { id: "fanout-webhooks", triggers: [
    { event: "audit.complete" },
    { event: "drift.detected" },
    { event: "recommendation.created" },
    { event: "report/generated" },
    { event: "hallucination/detected" },
    { event: "hallucination/acknowledged" },
    { event: "visibility/trend-updated" },
    { event: "agent/readiness-scored" },
  ] },
  async ({ event, step }: { event: { id: string; name: string; data: { organizationId?: string; brandId?: string; auditId?: string } }; step: any }) => {
    const { organizationId } = event.data;
    if (!organizationId) return { skipped: true, reason: "no_org_id" };

    const deliveryEventName = EVENT_NAME_MAP[event.name];
    if (!deliveryEventName) return { skipped: true, reason: "unmapped_event" };

    const internalEventId = event.id;

    const endpoints = await step.run("load-endpoints", async () => {
      return withRlsContext(organizationId, async (tx) => {
        return tx
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
    });

    if (endpoints.length === 0) return { skipped: true, reason: "no_matching_endpoints" };

    let delivered = 0;
    for (const ep of endpoints) {
      await step.run(`deliver-${ep.id}`, async () => {
        const [existing] = await serviceDb
          .select({ id: webhookDeliveries.id })
          .from(webhookDeliveries)
          .where(
            and(
              eq(webhookDeliveries.endpointId, ep.id),
              eq(webhookDeliveries.internalEventId, internalEventId),
            ),
          )
          .limit(1);

        if (existing) return { deduped: true };

        await inngest.send({
          name: "webhook.deliver" as const,
          data: {
            endpointId: ep.id,
            eventName: deliveryEventName,
            payload: event.data,
            organizationId,
            internalEventId,
          },
        });
      });
      delivered++;
    }

    return { delivered };
  },
);
