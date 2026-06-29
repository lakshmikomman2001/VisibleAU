import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, remediationTasks } from "@/db/schema";
import { getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { inngest } from "@/lib/inngest/client";
import { checkQuota } from "@/lib/scheduling/quota-check";
import { recordReauditResults } from "@/lib/workflow/validation-scheduler";
import { markReauditDeferred } from "@/lib/workflow/task-manager";

export const triggerValidationReaudit = inngest.createFunction(
  {
    id: "trigger-validation-reaudit",
    triggers: [{ event: "task/completed" }],
  },
  async ({
    event,
    step,
  }: {
    event: {
      data: {
        taskId: string;
        brandId: string;
        orgId: string;
      };
    };
    step: {
      sleep: (id: string, duration: string) => Promise<void>;
      run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
    };
  }) => {
    const { taskId, brandId, orgId } = event.data;

    await step.sleep("wait-14-days", "14 days");

    const allowed = await checkQuota(orgId, brandId);

    if (!allowed) {
      await markReauditDeferred(taskId, "quota_exceeded");
      return { deferred: true, reason: "quota_exceeded" };
    }

    const auditId = await step.run("create-reaudit-audit", async () => {
      const { id } = await db.transaction(async (tx) => {
        const num = await getNextAuditNumber(orgId, tx);
        const [inserted] = await tx
          .insert(audits)
          .values({
            brandId,
            organizationId: orgId,
            auditNumber: num,
            triggeredBy: "reaudit",
            status: "pending",
            metadata: { reauditTaskId: taskId },
          })
          .returning({ id: audits.id });
        return inserted;
      });

      await db
        .update(remediationTasks)
        .set({ reauditId: id, updatedAt: new Date() })
        .where(eq(remediationTasks.id, taskId));

      return id;
    });

    await step.run("run-reaudit", async () => {
      await runAuditInline(auditId);
    });

    await step.run("record-lift", async () => {
      const [audit] = await db
        .select({ scoreComposite: audits.scoreComposite })
        .from(audits)
        .where(eq(audits.id, auditId));

      if (audit?.scoreComposite) {
        await recordReauditResults(
          taskId,
          auditId,
          Number(audit.scoreComposite),
        );
      }
    });

    return { deferred: false, auditId };
  },
);
