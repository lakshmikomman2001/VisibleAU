import { eq } from "drizzle-orm";
import { db, setRlsContext } from "@/db/client";
import { bulkOperations } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";

export const bulkReauditOrchestrate = inngest.createFunction(
  {
    id: "bulk-reaudit-orchestrate",
    concurrency: { limit: 4, key: "event.data.organizationId" },
    triggers: [{ event: "bulk/reaudit.requested" }],
  },
  async ({ event, step }: { event: { data: { brandIds: string[]; organizationId: string; bulkOperationId: string } }; step: any }) => {
    const { brandIds, organizationId, bulkOperationId } = event.data;

    await step.run("mark-running", async () => {
      await setRlsContext(db, organizationId);
      await db
        .update(bulkOperations)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(bulkOperations.id, bulkOperationId));
    });

    await step.run("fanout-audits", async () => {
      await inngest.send(
        brandIds.map((brandId: string) => ({
          name: "audit/start" as const,
          data: { brandId, organizationId, triggeredBy: "bulk_reaudit", bulkOperationId },
        }))
      );
    });

    await step.sleep("wait-for-audits", `${brandIds.length * 5}m`);

    await step.run("mark-complete", async () => {
      await setRlsContext(db, organizationId);
      await db
        .update(bulkOperations)
        .set({ status: "complete", completedAt: new Date() })
        .where(eq(bulkOperations.id, bulkOperationId));
    });
  }
);
