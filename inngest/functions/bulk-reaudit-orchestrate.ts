import { eq, sql } from "drizzle-orm";
import { db, setRlsContext } from "@/db/client";
import { audits, bulkOperations } from "@/db/schema";
import { getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { inngest } from "@/lib/inngest/client";
import { checkQuota } from "@/lib/scheduling/quota-check";

export const bulkReauditOrchestrate = inngest.createFunction(
  {
    id: "bulk-reaudit-orchestrate",
    concurrency: { limit: 4, key: "event.data.organizationId" },
    triggers: [{ event: "bulk/reaudit.requested" }],
  },
  async ({
    event,
    step,
  }: {
    event: {
      data: {
        brandIds: string[];
        organizationId: string;
        operationId: string;
      };
    };
    step: any;
  }) => {
    const { brandIds, organizationId, operationId } = event.data;

    await step.run("mark-running", async () => {
      await setRlsContext(db, organizationId);
      await db
        .update(bulkOperations)
        .set({
          status: "running",
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bulkOperations.id, operationId));
    });

    let completed = 0;
    let skipped = 0;
    let failed = 0;

    for (const brandId of brandIds) {
      const auditId = await step.run(
        `process-${brandId}`,
        async () => {
          const allowed = await checkQuota(organizationId, brandId);
          if (!allowed) {
            await setRlsContext(db, organizationId);
            await db
              .update(bulkOperations)
              .set({
                failedBrands: sql`${bulkOperations.failedBrands} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(bulkOperations.id, operationId));
            return null;
          }

          const { id } = await db.transaction(async (tx) => {
            const num = await getNextAuditNumber(organizationId, tx);
            const [inserted] = await tx
              .insert(audits)
              .values({
                brandId,
                organizationId,
                auditNumber: num,
                triggeredBy: "bulk_reaudit",
                status: "pending",
                metadata: { bulkOperationId: operationId },
              })
              .returning({ id: audits.id });
            return inserted;
          });

          return id;
        },
      );

      if (!auditId) {
        skipped++;
        continue;
      }

      try {
        await step.run(`run-audit-${brandId}`, async () => {
          await runAuditInline(auditId);
          await setRlsContext(db, organizationId);
          await db
            .update(bulkOperations)
            .set({
              completedBrands: sql`${bulkOperations.completedBrands} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(bulkOperations.id, operationId));
        });
        completed++;
      } catch {
        await step.run(`fail-audit-${brandId}`, async () => {
          await setRlsContext(db, organizationId);
          await db
            .update(bulkOperations)
            .set({
              failedBrands: sql`${bulkOperations.failedBrands} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(bulkOperations.id, operationId));
        });
        failed++;
      }
    }

    await step.run("mark-complete", async () => {
      await setRlsContext(db, organizationId);
      await db
        .update(bulkOperations)
        .set({
          status: "complete",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bulkOperations.id, operationId));
    });

    return { completed, skipped, failed, total: brandIds.length };
  },
);
