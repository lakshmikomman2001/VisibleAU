import { db } from "@/db/client";
import { audits } from "@/db/schema";
import { getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { inngest } from "@/lib/inngest/client";
import { checkQuota } from "@/lib/scheduling/quota-check";
import {
  getScheduledRuns,
  markRunning,
  markCompleted,
  markFailed,
} from "@/lib/workflow/workflow-orchestrator";
import type { WorkflowRunResult } from "@/lib/workflow/types";

const AUDIT_WORKFLOW_TYPES = ["weekly_audit", "post_fix_validation"];

export const scheduleWorkflowRuns = inngest.createFunction(
  {
    id: "schedule-workflow-runs",
    triggers: [{ cron: "0 2 * * *" }],
  },
  async ({
    step,
  }: {
    step: {
      run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
    };
  }) => {
    const runs = await step.run("get-scheduled", async () => {
      return getScheduledRuns();
    });

    let triggered = 0;
    let skipped = 0;

    for (const run of runs) {
      const startMs = Date.now();

      await step.run(`process-${run.id}`, async () => {
        await markRunning(run.id);

        if (AUDIT_WORKFLOW_TYPES.includes(run.workflowType)) {
          const allowed = await checkQuota(run.organizationId, run.brandId);
          if (!allowed) {
            await markFailed(run.id, "quota_exceeded");
            skipped++;
            return;
          }
        }

        try {
          let auditId: string | undefined;

          if (AUDIT_WORKFLOW_TYPES.includes(run.workflowType)) {
            const { id } = await db.transaction(async (tx) => {
              const num = await getNextAuditNumber(run.organizationId, tx);
              const [inserted] = await tx
                .insert(audits)
                .values({
                  brandId: run.brandId,
                  organizationId: run.organizationId,
                  auditNumber: num,
                  triggeredBy: "workflow_run",
                  status: "pending",
                  metadata: { workflowRunId: run.id },
                })
                .returning({ id: audits.id });
              return inserted;
            });

            auditId = id;
            await runAuditInline(auditId);
          }

          const result: WorkflowRunResult = {
            durationMs: Date.now() - startMs,
            auditsTriggered: auditId ? 1 : 0,
            auditId,
          };
          await markCompleted(run.id, result);
          triggered++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          await markFailed(run.id, msg);
        }
      });
    }

    return { triggered, skipped, total: runs.length };
  },
);
