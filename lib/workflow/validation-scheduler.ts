import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { remediationTasks } from "@/db/schema";
import { checkQuota } from "@/lib/scheduling/quota-check";
import { auditChanges } from "@/lib/visibility/audit-change";
import { markReauditDeferred } from "./task-manager";

export const REAUDIT_DELAY_DAYS = 14;

export async function scheduleReaudit(
  taskId: string,
  orgId: string,
  brandId: string,
): Promise<{ scheduled: boolean; reason?: string }> {
  const allowed = await checkQuota(orgId, brandId);
  if (!allowed) {
    await markReauditDeferred(taskId, "quota_exceeded", serviceDb);
    return { scheduled: false, reason: "quota_exceeded" };
  }

  return { scheduled: true };
}

/**
 * Task #46 Phase 2: companion to recordReauditResults for the case where
 * the re-audit itself has zero organic, run-1 brand-mention rows
 * (lib/scoring/dimension-result.ts's gate) -- the re-audit DID run (unlike
 * markReauditDeferred's quota_exceeded/budget_cap reasons in
 * task-manager.ts, which mean a re-audit never ran at all), but there's
 * nothing real to compute a lift from: its scoreComposite is a real,
 * non-fabricated "0.00", and feeding that into recordReauditResults would
 * compute a nonsensical negative "lift" (0 - scoreBefore) for every such
 * re-audit. scoreAfter/liftAchieved are left null here -- never a
 * fabricated 0 -- and reauditDeferredReason carries the honest,
 * post-hoc reason instead. reauditId IS recorded (unlike
 * markReauditDeferred), since a re-audit genuinely exists to link to.
 */
export async function recordReauditInsufficientData(taskId: string, reauditId: string) {
  await serviceDb
    .update(remediationTasks)
    .set({
      reauditId,
      reauditDeferredReason: "insufficient_data",
      updatedAt: new Date(),
    })
    .where(eq(remediationTasks.id, taskId));
}

export async function recordReauditResults(
  taskId: string,
  reauditId: string,
  scoreAfter: number,
  fanOutAfter?: number,
  similarityAfter?: number,
) {
  const liftAchieved = await computeLift(taskId, reauditId);

  await serviceDb
    .update(remediationTasks)
    .set({
      reauditId,
      scoreAfter: scoreAfter.toString(),
      fanOutAfter: fanOutAfter?.toString(),
      similarityAfter: similarityAfter?.toString(),
      liftAchieved: liftAchieved?.toString(),
      updatedAt: new Date(),
    })
    .where(eq(remediationTasks.id, taskId));
}

/**
 * 17 Nov, part 3: the change from the task's own audit to its re-audit, in the shown percentage points, when the two
 * are comparable (lib/visibility/audit-change.ts) -- else null. It was scoreAfter − score_before, and score_before is
 * a recommendation's expected-impact bucket (80, 50 or 20), not a measurement: "+12.3%" was made up.
 */
async function computeLift(taskId: string, reauditId: string): Promise<number | null> {
  const [task] = await serviceDb
    .select({ auditId: remediationTasks.auditId })
    .from(remediationTasks)
    .where(eq(remediationTasks.id, taskId));
  if (!task?.auditId) return null;
  const change = (
    await auditChanges(serviceDb, [{ key: taskId, beforeId: task.auditId, afterId: reauditId }])
  ).get(taskId);
  return change?.kind === "measured" ? change.points : null;
}
