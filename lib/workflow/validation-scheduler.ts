import { db } from "@/db/client";
import { remediationTasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkQuota } from "@/lib/scheduling/quota-check";
import { markReauditDeferred } from "./task-manager";

export const REAUDIT_DELAY_DAYS = 14;

export async function scheduleReaudit(
  taskId: string,
  orgId: string,
  brandId: string,
): Promise<{ scheduled: boolean; reason?: string }> {
  const allowed = await checkQuota(orgId, brandId);
  if (!allowed) {
    await markReauditDeferred(taskId, "quota_exceeded");
    return { scheduled: false, reason: "quota_exceeded" };
  }

  return { scheduled: true };
}

export async function recordReauditResults(
  taskId: string,
  reauditId: string,
  scoreAfter: number,
  fanOutAfter?: number,
  similarityAfter?: number,
) {
  const liftAchieved = await computeLift(taskId, scoreAfter);

  await db
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

async function computeLift(
  taskId: string,
  scoreAfter: number,
): Promise<number | null> {
  const [task] = await db
    .select({ scoreBefore: remediationTasks.scoreBefore })
    .from(remediationTasks)
    .where(eq(remediationTasks.id, taskId));

  if (!task?.scoreBefore) return null;
  return scoreAfter - Number(task.scoreBefore);
}
