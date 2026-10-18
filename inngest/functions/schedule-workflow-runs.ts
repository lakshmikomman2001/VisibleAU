import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getBrandPromptPackVersion, getNextAuditNumber } from "@/lib/audit/numbering";
import { METHODOLOGY_VERSION } from "@/lib/llm/methodology";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { brandReadyForAudit } from "@/lib/brands/needs-confirmation";
import { inngest } from "@/lib/inngest/client";
import { checkQuota } from "@/lib/scheduling/quota-check";
import type { WorkflowRunResult } from "@/lib/workflow/types";
import {
  getScheduledRuns,
  markCompleted,
  markFailed,
  markRunning,
} from "@/lib/workflow/workflow-orchestrator";

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

          // Build 1 follow-up (entry-point check): checked BEFORE
          // creating the audit row, mirroring the quota check above --
          // without this, runAuditInline() below would silently fail
          // internally (it never throws) while the try block's own
          // normal return still called markCompleted(), reporting a
          // confirmation-blocked brand's workflow run as successful.
          const [brandRow] = await serviceDb
            .select()
            .from(brands)
            .where(eq(brands.id, run.brandId));
          if (
            !brandRow ||
            !brandReadyForAudit({
              classificationStatus: brandRow.classificationStatus,
              classification: brandRow.classification,
              categoryConfirmedAt: brandRow.categoryConfirmedAt,
              categories: brandRow.categories,
              audience: brandRow.audience,
              locationMode: brandRow.locationMode,
            })
          ) {
            await markFailed(run.id, "needs_confirmation");
            skipped++;
            return;
          }
        }

        try {
          let auditId: string | undefined;

          if (AUDIT_WORKFLOW_TYPES.includes(run.workflowType)) {
            const { id } = await serviceDb.transaction(async (tx) => {
              const num = await getNextAuditNumber(run.organizationId, tx);
              const promptPackVersion = await getBrandPromptPackVersion(run.brandId, tx);
              const [inserted] = await tx
                .insert(audits)
                .values({
                  brandId: run.brandId,
                  organizationId: run.organizationId,
                  auditNumber: num,
                  triggeredBy: "workflow_run",
                  status: "pending",
                  metadata: { workflowRunId: run.id },
                  promptPackVersion,
                  methodologyVersion: METHODOLOGY_VERSION,
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
