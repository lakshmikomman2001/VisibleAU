import { desc, eq } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";

export async function handleDeliveryFailure(
  endpointId: string,
  organizationId: string,
): Promise<void> {
  await withRlsContext(organizationId, async (tx) => {
    const recentDeliveries = await tx
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.endpointId, endpointId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(5);

    const allFailed =
      recentDeliveries.length === 5 &&
      recentDeliveries.every(
        (d) => d.responseStatus === null || d.responseStatus >= 400,
      );

    if (allFailed) {
      await tx
        .update(webhookEndpoints)
        .set({
          isActive: false,
          lastDeliveryStatus: "dead",
          updatedAt: new Date(),
        })
        .where(eq(webhookEndpoints.id, endpointId));
    } else {
      await tx
        .update(webhookEndpoints)
        .set({
          lastDeliveryStatus: "failed",
          lastDeliveryAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(webhookEndpoints.id, endpointId));
    }
  });
}
