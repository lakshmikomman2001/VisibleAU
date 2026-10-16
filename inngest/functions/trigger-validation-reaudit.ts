import { and, eq, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, citations, remediationTasks } from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { inngest } from "@/lib/inngest/client";
import { checkQuota } from "@/lib/scheduling/quota-check";
import { markReauditDeferred } from "@/lib/workflow/task-manager";
import {
  recordReauditInsufficientData,
  recordReauditResults,
} from "@/lib/workflow/validation-scheduler";

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
      await markReauditDeferred(taskId, "quota_exceeded", serviceDb);
      return { deferred: true, reason: "quota_exceeded" };
    }

    const auditId = await step.run("create-reaudit-audit", async () => {
      const { id } = await serviceDb.transaction(async (tx) => {
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

      await serviceDb
        .update(remediationTasks)
        .set({ reauditId: id, updatedAt: new Date() })
        .where(eq(remediationTasks.id, taskId));

      return id;
    });

    await step.run("run-reaudit", async () => {
      await runAuditInline(auditId);
    });

    await step.run("record-lift", async () => {
      const [audit] = await serviceDb
        .select({ scoreComposite: audits.scoreComposite })
        .from(audits)
        .where(eq(audits.id, auditId));

      if (audit?.scoreComposite == null) return;

      // Task #46 Phase 2: the old `if (audit?.scoreComposite)` guard is a
      // truthy check on a DB string -- "0.00" (a zero-mention re-audit) is
      // truthy, so it passed and got recorded as a fabricated scoreAfter =
      // 0, which computeLift then turned into a nonsensical negative lift
      // (0 - scoreBefore). The TRUE independent-sample mention count
      // (organic, run_number = 1 -- lib/scoring/dimension-result.ts's
      // gate) decides whether this re-audit found anything real to measure.
      const [{ mentionCount }] = await serviceDb
        .select({
          mentionCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
        })
        .from(citations)
        .where(and(eq(citations.auditId, auditId), ORGANIC_ONLY, eq(citations.runNumber, 1)));

      // Postgres SUM() surfaces as a string via the JS driver -- coerce
      // before the `=== 0` check.
      if (Number(mentionCount) === 0) {
        await recordReauditInsufficientData(taskId, auditId);
        return;
      }

      await recordReauditResults(taskId, auditId, Number(audit.scoreComposite));
    });

    return { deferred: false, auditId };
  },
);
