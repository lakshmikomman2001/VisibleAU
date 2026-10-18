import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, remediationTasks } from "@/db/schema";
import { getBrandPromptPackVersion, getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { inngest } from "@/lib/inngest/client";
import { checkQuota } from "@/lib/scheduling/quota-check";
import { resolveAuditDimensionsAndComposite } from "@/lib/scoring/resolve-audit-dimensions";
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
        const promptPackVersion = await getBrandPromptPackVersion(brandId, tx);
        const [inserted] = await tx
          .insert(audits)
          .values({
            brandId,
            organizationId: orgId,
            auditNumber: num,
            triggeredBy: "reaudit",
            status: "pending",
            metadata: { reauditTaskId: taskId },
            promptPackVersion,
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

      // Task #46 (fix: stored value contradicting its own CI): one call
      // now both gates on the real mention count AND supplies the honest
      // "after" score -- the old code's `audit.scoreComposite` was the
      // STORED column (a snapshot from whenever the re-audit completed,
      // never recomputed), while the separate mention-count query below
      // it only gated on/off recording at all; it never corrected the
      // VALUE recorded as scoreAfter. recordReauditResults now gets the
      // same live-recomputed composite the audit page itself would show
      // for this re-audit, not a value that could silently go stale.
      const { composite, mentionedCount } = await resolveAuditDimensionsAndComposite(
        serviceDb,
        auditId,
      );

      if (mentionedCount === 0) {
        await recordReauditInsufficientData(taskId, auditId);
        return;
      }

      await recordReauditResults(taskId, auditId, composite.value);
    });

    return { deferred: false, auditId };
  },
);
