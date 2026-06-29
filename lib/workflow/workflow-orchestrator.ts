import { db } from "@/db/client";
import { workflowRuns } from "@/db/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import type { WorkflowRunResult } from "./types";

export async function getScheduledRuns() {
  return db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.status, "scheduled"),
        lte(workflowRuns.scheduledFor, new Date()),
      ),
    );
}

export async function markRunning(runId: string) {
  await db
    .update(workflowRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(workflowRuns.id, runId));
}

export async function markCompleted(
  runId: string,
  result: WorkflowRunResult,
) {
  await db
    .update(workflowRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      resultSummary: result,
    })
    .where(eq(workflowRuns.id, runId));
}

export async function markFailed(runId: string, errorMessage: string) {
  const result: WorkflowRunResult = { durationMs: 0, errorMessage };
  await db
    .update(workflowRuns)
    .set({
      status: "failed",
      completedAt: new Date(),
      resultSummary: result,
    })
    .where(eq(workflowRuns.id, runId));
}

export async function createWorkflowRun(input: {
  organizationId: string;
  brandId: string;
  workflowType: string;
  scheduledFor: Date;
}) {
  const [run] = await db
    .insert(workflowRuns)
    .values(input)
    .returning();
  return run;
}
