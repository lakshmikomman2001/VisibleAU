import { eq } from "drizzle-orm";
import { db, setRlsContext } from "@/db/client";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { deliver } from "@/lib/webhooks/deliver";
import { formatForChannel } from "@/lib/webhooks/format";
import { handleDeliveryFailure } from "@/lib/webhooks/retry";
import { signHmacSha256 } from "@/lib/webhooks/sign";

export const deliverWebhookFn = inngest.createFunction(
  { id: "deliver-webhook", retries: 5, triggers: [{ event: "webhook.deliver" }] },
  async ({ event, step }: { event: { data: { endpointId: string; eventName: string; payload: unknown; organizationId: string } }; step: any }) => {
    const { endpointId, eventName, payload, organizationId } = event.data;

    const endpoint = await step.run("load-endpoint", async () => {
      await setRlsContext(db, organizationId);
      const [ep] = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, endpointId));
      return ep ?? null;
    });

    if (!endpoint?.isActive) return { skipped: true, reason: "endpoint_inactive" };

    const formattedBody = formatForChannel(endpoint.channel, eventName, payload);
    const signature = signHmacSha256(
      JSON.stringify(formattedBody),
      endpoint.signingSecret,
    );

    try {
      const result = await deliver(endpoint.url, formattedBody, signature, eventName);

      await step.run("record-success", async () => {
        await setRlsContext(db, organizationId);
        await db.insert(webhookDeliveries).values({
          endpointId,
          organizationId,
          event: eventName,
          payload: formattedBody as Record<string, unknown>,
          responseStatus: result.status,
          deliveredAt: new Date(),
        });
        await db
          .update(webhookEndpoints)
          .set({
            lastDeliveryStatus: "success",
            lastDeliveryAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(webhookEndpoints.id, endpointId));
      });

      return { ok: true, status: result.status };
    } catch (err) {
      await step.run("record-failure", async () => {
        await setRlsContext(db, organizationId);
        await db.insert(webhookDeliveries).values({
          endpointId,
          organizationId,
          event: eventName,
          payload: formattedBody as Record<string, unknown>,
          failedAt: new Date(),
        });
        await handleDeliveryFailure(endpointId, organizationId);
      });

      throw err;
    }
  },
);
