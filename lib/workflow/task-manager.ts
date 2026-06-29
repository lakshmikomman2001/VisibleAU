import { db } from "@/db/client";
import { remediationTasks, actionItems } from "@/db/schema";
import { eq, and, sql, count, inArray } from "drizzle-orm";
import {
  deriveConfidenceLabel,
  computePriorityScore,
  rankTasks,
} from "./priority-scorer";

const CONFIDENCE_TO_QUALITY: Record<string, string> = {
  confirmed: "sufficient",
  likely: "partial",
  hypothesis: "insufficient",
};

const IMPACT_TO_SCORE: Record<string, number> = {
  high: 80,
  medium: 50,
  low: 20,
};

const DEFAULT_MANUAL_IMPACT = 50;

const VALID_STATUSES = [
  "open",
  "in_progress",
  "ready_for_review",
  "complete",
  "wont_fix",
] as const;

type TaskStatus = (typeof VALID_STATUSES)[number];

const VALID_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ["in_progress", "wont_fix"],
  in_progress: ["ready_for_review", "open", "wont_fix"],
  ready_for_review: ["complete", "in_progress", "wont_fix"],
  complete: [],
  wont_fix: ["open"],
};

export interface CreateTaskInput {
  organizationId: string;
  brandId: string;
  auditId?: string;
  recommendationId?: string;
  recommendationKey?: string;
  title: string;
  description?: string;
  dimension?: string;
  effort?: "low" | "medium" | "high";
  qualityStatus?: string;
  scoreBefore?: number;
  estimatedAfter?: number;
}

export async function createTask(input: CreateTaskInput) {
  const confidenceLabel = deriveConfidenceLabel(input.qualityStatus ?? null);
  const hasScoreInputs = input.scoreBefore != null || input.estimatedAfter != null;
  const rawImpact = (input.scoreBefore ?? 0) - (input.estimatedAfter ?? 0);
  const impact = hasScoreInputs ? Math.abs(rawImpact) : DEFAULT_MANUAL_IMPACT;
  const priorityScore = computePriorityScore(
    impact,
    input.qualityStatus ?? null,
    input.effort ?? null,
  );

  const [task] = await db
    .insert(remediationTasks)
    .values({
      organizationId: input.organizationId,
      brandId: input.brandId,
      auditId: input.auditId,
      recommendationId: input.recommendationId,
      recommendationKey: input.recommendationKey,
      title: input.title,
      description: input.description,
      dimension: input.dimension,
      effort: input.effort,
      confidenceLabel,
      priority: Math.max(1, Math.round(priorityScore * 100)),
      scoreBefore: input.scoreBefore?.toString(),
      status: "open",
    })
    .returning();

  return task;
}

export async function updateTaskStatus(
  taskId: string,
  newStatus: string,
  wontFixReason?: string,
) {
  if (!VALID_STATUSES.includes(newStatus as TaskStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }

  const [existing] = await db
    .select()
    .from(remediationTasks)
    .where(eq(remediationTasks.id, taskId));

  if (!existing) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const currentStatus = existing.status as TaskStatus;

  if (currentStatus === "complete" && newStatus === "complete") {
    return existing;
  }

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(newStatus as TaskStatus)) {
    throw new Error(
      `Cannot transition from '${currentStatus}' to '${newStatus}'`,
    );
  }

  if (newStatus === "wont_fix" && !wontFixReason) {
    throw new Error("wont_fix_reason is required when status is 'wont_fix'");
  }

  const updates: Record<string, unknown> = {
    status: newStatus,
    updatedAt: new Date(),
  };

  if (newStatus === "wont_fix") {
    updates.wontFixReason = wontFixReason;
  }

  if (newStatus === "complete") {
    updates.completedAt = new Date();
  }

  const [updated] = await db
    .update(remediationTasks)
    .set(updates)
    .where(eq(remediationTasks.id, taskId))
    .returning();

  return updated;
}

export async function getTasksByBrand(
  brandId: string,
  statusFilter?: string,
) {
  const conditions = [eq(remediationTasks.brandId, brandId)];
  if (statusFilter) {
    conditions.push(eq(remediationTasks.status, statusFilter));
  }

  return db
    .select()
    .from(remediationTasks)
    .where(and(...conditions))
    .orderBy(remediationTasks.priority);
}

export async function getTaskCountsByStatus(brandId: string) {
  const rows = await db
    .select({
      status: remediationTasks.status,
      count: count(),
    })
    .from(remediationTasks)
    .where(eq(remediationTasks.brandId, brandId))
    .groupBy(remediationTasks.status);

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}

export async function markReauditDeferred(
  taskId: string,
  reason: string,
) {
  await db
    .update(remediationTasks)
    .set({
      reauditDeferredReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(remediationTasks.id, taskId));
}

export async function findExistingTaskForRecommendation(
  recommendationId: string,
) {
  const [existing] = await db
    .select({ id: remediationTasks.id, status: remediationTasks.status })
    .from(remediationTasks)
    .where(
      and(
        eq(remediationTasks.recommendationId, recommendationId),
        inArray(remediationTasks.status, ["open", "in_progress", "ready_for_review"]),
      ),
    );
  return existing ?? null;
}

export async function createTaskFromRecommendation(
  recommendationId: string,
  organizationId: string,
  brandId: string,
): Promise<{ task: Record<string, unknown>; existing: boolean }> {
  const existing = await findExistingTaskForRecommendation(recommendationId);
  if (existing) {
    return { task: existing, existing: true };
  }

  const [rec] = await db
    .select()
    .from(actionItems)
    .where(eq(actionItems.id, recommendationId));

  if (!rec) {
    throw new Error(`Recommendation not found: ${recommendationId}`);
  }

  const qualityStatus = CONFIDENCE_TO_QUALITY[rec.confidenceLabel] ?? null;
  const scoreBefore = IMPACT_TO_SCORE[rec.expectedImpactScore] ?? 50;

  const task = await createTask({
    organizationId,
    brandId,
    auditId: rec.auditId,
    recommendationId: rec.id,
    recommendationKey: rec.recommendationKey,
    title: rec.title,
    description: rec.action,
    dimension: rec.dimension,
    qualityStatus,
    scoreBefore,
  });

  return { task, existing: false };
}
