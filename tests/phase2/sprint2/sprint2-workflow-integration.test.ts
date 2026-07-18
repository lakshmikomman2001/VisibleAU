/**
 * Sprint 2 Backend E2E Integration Tests
 *
 * Covers: BE-1 (core workflow loop), BE-2 (error paths, RLS, idempotency),
 *         BE-3 (cross-sprint FK chains).
 *
 * Runs against the DEV database (visibleau), NOT prod.
 * Uses rls_test_role for RLS isolation assertions.
 */
import { vi, afterAll, beforeAll, describe, expect, it } from "vitest";

// Force dev DB before @/db/client initializes its postgres pool
vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://postgres:password@localhost:5432/visibleau";
  process.env.DIRECT_URL = "postgresql://postgres:password@localhost:5432/visibleau";
});

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import { serviceDb } from "@/db/client";
import { createTask, updateTaskStatus, getTasksByBrand, getTaskCountsByStatus, markReauditDeferred, findExistingTaskForRecommendation, createTaskFromRecommendation } from "@/lib/workflow/task-manager";
import { createWorkflowRun, getScheduledRuns, markRunning, markCompleted, markFailed } from "@/lib/workflow/workflow-orchestrator";
import { recordReauditResults } from "@/lib/workflow/validation-scheduler";
import { remediationTasks, workflowRuns, contentDrafts, actionItems, audits, organizations, brands } from "@/db/schema";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

// Unique test identifiers to avoid collisions with real data
const TEST_PREFIX = "s2_integ_test_";
const TEST_CLERK_ORG_A = `${TEST_PREFIX}org_a_${Date.now()}`;
const TEST_CLERK_ORG_B = `${TEST_PREFIX}org_b_${Date.now()}`;

// Track all created IDs for cleanup
const createdIds = {
  contentDrafts: [] as string[],
  remediationTasks: [] as string[],
  workflowRuns: [] as string[],
  actionItems: [] as string[],
  audits: [] as string[],
  brands: [] as string[],
  organizations: [] as string[],
};

let client: ReturnType<typeof postgres>;
let orgAId: string;
let orgBId: string;
let brandAId: string;
let brandBId: string;
let auditAId: string;
let recAId: string;

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });

  // Create two test orgs
  const [orgA] = await client`
    INSERT INTO organizations (clerk_org_id, name, region, tier)
    VALUES (${TEST_CLERK_ORG_A}, 'Test Org A', 'au', 'starter')
    RETURNING id
  `;
  const [orgB] = await client`
    INSERT INTO organizations (clerk_org_id, name, region, tier)
    VALUES (${TEST_CLERK_ORG_B}, 'Test Org B', 'au', 'free')
    RETURNING id
  `;
  orgAId = orgA.id;
  orgBId = orgB.id;
  createdIds.organizations.push(orgAId, orgBId);

  // Create one brand per org
  const [brandA] = await client`
    INSERT INTO brands (organization_id, name, domain, vertical, region)
    VALUES (${orgAId}, 'Brand A Test', 'branda-test.com.au', 'tradies', 'au')
    RETURNING id
  `;
  const [brandB] = await client`
    INSERT INTO brands (organization_id, name, domain, vertical, region)
    VALUES (${orgBId}, 'Brand B Test', 'brandb-test.com.au', 'saas', 'au')
    RETURNING id
  `;
  brandAId = brandA.id;
  brandBId = brandB.id;
  createdIds.brands.push(brandAId, brandBId);

  // Create an audit for org A (needed for recommendation FK)
  const [auditA] = await client`
    INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, triggered_by)
    VALUES (${brandAId}, ${orgAId}, 99801, ARRAY['chatgpt'], 'complete', 'manual')
    RETURNING id
  `;
  auditAId = auditA.id;
  createdIds.audits.push(auditAId);

  // Create a recommendation (action_item) for testing task-from-recommendation
  const [recA] = await client`
    INSERT INTO action_items (
      organization_id, brand_id, audit_id, recommendation_key, dimension,
      title, action, confidence_label, expected_impact_score
    )
    VALUES (
      ${orgAId}, ${brandAId}, ${auditAId}, 'press-release', 'content',
      'Write a press release', 'Draft and publish a press release for brand visibility',
      'confirmed', 'high'
    )
    RETURNING id
  `;
  recAId = recA.id;
  createdIds.actionItems.push(recAId);
}, 30_000);

afterAll(async () => {
  // FK-safe cleanup order: content_drafts → remediation_tasks → workflow_runs → action_items → audits → brands → orgs
  for (const id of createdIds.contentDrafts) {
    await client`DELETE FROM content_drafts WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdIds.remediationTasks) {
    await client`DELETE FROM remediation_tasks WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdIds.workflowRuns) {
    await client`DELETE FROM workflow_runs WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdIds.actionItems) {
    await client`DELETE FROM action_items WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdIds.audits) {
    await client`DELETE FROM audits WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdIds.brands) {
    await client`DELETE FROM brands WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdIds.organizations) {
    await client`DELETE FROM organizations WHERE id = ${id}`.catch(() => {});
  }

  await client.end();
}, 30_000);

// ═══════════════════════════════════════════════════════════════
// BE-1: Core Workflow Loop Integration Tests
// ═══════════════════════════════════════════════════════════════

describe("BE-1: createTask + status transitions (DB roundtrip)", () => {
  let taskId: string;

  it("creates a task with all required fields persisted", async () => {
    const task = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      auditId: auditAId,
      title: "Fix schema markup",
      description: "Add FAQ schema to homepage",
      dimension: "technical",
      effort: "low",
      qualityStatus: "sufficient",
      scoreBefore: 40,
      estimatedAfter: 70,
    }, serviceDb);

    expect(task).toBeDefined();
    expect(task.id).toBeTruthy();
    expect(task.status).toBe("open");
    expect(task.organizationId).toBe(orgAId);
    expect(task.brandId).toBe(brandAId);
    expect(task.title).toBe("Fix schema markup");
    expect(task.dimension).toBe("technical");
    expect(task.effort).toBe("low");
    expect(task.confidenceLabel).toBe("High");
    expect(task.priority).toBeGreaterThanOrEqual(1);
    expect(task.completedAt).toBeNull();

    taskId = task.id;
    createdIds.remediationTasks.push(taskId);
  });

  it("transitions open → in_progress", async () => {
    const updated = await updateTaskStatus(taskId, "in_progress", undefined, serviceDb);
    expect(updated.status).toBe("in_progress");
    expect(updated.completedAt).toBeNull();
  });

  it("transitions in_progress → ready_for_review", async () => {
    const updated = await updateTaskStatus(taskId, "ready_for_review", undefined, serviceDb);
    expect(updated.status).toBe("ready_for_review");
  });

  it("transitions ready_for_review → complete (sets completedAt)", async () => {
    const updated = await updateTaskStatus(taskId, "complete", undefined, serviceDb);
    expect(updated.status).toBe("complete");
    expect(updated.completedAt).toBeTruthy();
  });

  it("idempotent: complete → complete returns existing without error (post-fix)", async () => {
    const result = await updateTaskStatus(taskId, "complete", undefined, serviceDb);
    expect(result.status).toBe("complete");
    expect(result.id).toBe(taskId);
  });
});

describe("BE-1: getTasksByBrand + getTaskCountsByStatus", () => {
  const taskIds: string[] = [];

  beforeAll(async () => {
    const t1 = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      title: "Task for list test 1",
      effort: "medium",
    }, serviceDb);
    const t2 = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      title: "Task for list test 2",
      effort: "high",
    }, serviceDb);
    taskIds.push(t1.id, t2.id);
    createdIds.remediationTasks.push(t1.id, t2.id);

    await updateTaskStatus(t2.id, "in_progress", undefined, serviceDb);
  });

  it("getTasksByBrand returns tasks for the brand", async () => {
    const tasks = await getTasksByBrand(brandAId, undefined, serviceDb);
    const testTasks = tasks.filter((t) => taskIds.includes(t.id));
    expect(testTasks).toHaveLength(2);
  });

  it("getTasksByBrand with statusFilter returns only matching", async () => {
    const openTasks = await getTasksByBrand(brandAId, "open", serviceDb);
    const testOpen = openTasks.filter((t) => taskIds.includes(t.id));
    expect(testOpen).toHaveLength(1);
    expect(testOpen[0].status).toBe("open");
  });

  it("getTaskCountsByStatus returns correct counts", async () => {
    const counts = await getTaskCountsByStatus(brandAId, serviceDb);
    expect(counts.open).toBeGreaterThanOrEqual(1);
    expect(counts.in_progress).toBeGreaterThanOrEqual(1);
  });
});

describe("BE-1: workflow-orchestrator lifecycle (DB roundtrip)", () => {
  let runId: string;

  it("createWorkflowRun persists a scheduled run", async () => {
    const run = await createWorkflowRun({
      organizationId: orgAId,
      brandId: brandAId,
      workflowType: "weekly_audit",
      scheduledFor: new Date(Date.now() - 60_000),
    });

    expect(run).toBeDefined();
    expect(run.status).toBe("scheduled");
    expect(run.workflowType).toBe("weekly_audit");
    expect(run.startedAt).toBeNull();
    expect(run.completedAt).toBeNull();

    runId = run.id;
    createdIds.workflowRuns.push(runId);
  });

  it("getScheduledRuns returns runs scheduled in the past", async () => {
    const runs = await getScheduledRuns();
    const ours = runs.find((r) => r.id === runId);
    expect(ours).toBeDefined();
    expect(ours!.status).toBe("scheduled");
  });

  it("markRunning sets status and startedAt", async () => {
    await markRunning(runId);

    const [row] = await client`SELECT status, started_at FROM workflow_runs WHERE id = ${runId}`;
    expect(row.status).toBe("running");
    expect(row.started_at).toBeTruthy();
  });

  it("markCompleted sets status='completed' (-ed) and completedAt", async () => {
    await markCompleted(runId, { durationMs: 1234, auditsTriggered: 1 });

    const [row] = await client`SELECT status, completed_at, result_summary FROM workflow_runs WHERE id = ${runId}`;
    expect(row.status).toBe("completed");
    expect(row.completed_at).toBeTruthy();
    expect(row.result_summary.durationMs).toBe(1234);
  });
});

describe("BE-1: workflow-orchestrator — markFailed path", () => {
  let failRunId: string;

  beforeAll(async () => {
    const run = await createWorkflowRun({
      organizationId: orgAId,
      brandId: brandAId,
      workflowType: "post_fix_validation",
      scheduledFor: new Date(Date.now() - 60_000),
    });
    failRunId = run.id;
    createdIds.workflowRuns.push(failRunId);
    await markRunning(failRunId);
  });

  it("markFailed sets status='failed' with error message in resultSummary", async () => {
    await markFailed(failRunId, "quota_exceeded");

    const [row] = await client`SELECT status, completed_at, result_summary FROM workflow_runs WHERE id = ${failRunId}`;
    expect(row.status).toBe("failed");
    expect(row.completed_at).toBeTruthy();
    expect(row.result_summary.errorMessage).toBe("quota_exceeded");
    expect(row.result_summary.durationMs).toBe(0);
  });
});

describe("BE-1: three distinct status spellings", () => {
  it("remediation_tasks uses 'complete' (no -d)", async () => {
    const task = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      title: "Status spelling test",
    }, serviceDb);
    createdIds.remediationTasks.push(task.id);

    await updateTaskStatus(task.id, "in_progress", undefined, serviceDb);
    await updateTaskStatus(task.id, "ready_for_review", undefined, serviceDb);
    const completed = await updateTaskStatus(task.id, "complete", undefined, serviceDb);
    expect(completed.status).toBe("complete");
  });

  it("workflow_runs uses 'completed' (with -ed)", async () => {
    const run = await createWorkflowRun({
      organizationId: orgAId,
      brandId: brandAId,
      workflowType: "weekly_audit",
      scheduledFor: new Date(),
    });
    createdIds.workflowRuns.push(run.id);

    await markRunning(run.id);
    await markCompleted(run.id, { durationMs: 100 });

    const [row] = await client`SELECT status FROM workflow_runs WHERE id = ${run.id}`;
    expect(row.status).toBe("completed");
  });

  it("audits uses 'complete' (no -d) — verified from seeded audit", async () => {
    const [row] = await client`SELECT status FROM audits WHERE id = ${auditAId}`;
    expect(row.status).toBe("complete");
  });
});

describe("BE-1: recordReauditResults + lift computation", () => {
  let liftTaskId: string;
  let reauditId: string;

  beforeAll(async () => {
    const task = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      auditId: auditAId,
      title: "Lift test task",
      scoreBefore: 40,
    }, serviceDb);
    liftTaskId = task.id;
    createdIds.remediationTasks.push(liftTaskId);

    // Create a reaudit
    const [reaudit] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, triggered_by, score_composite)
      VALUES (${brandAId}, ${orgAId}, 99802, ARRAY['chatgpt'], 'complete', 'reaudit', 65.00)
      RETURNING id
    `;
    reauditId = reaudit.id;
    createdIds.audits.push(reauditId);
  });

  it("recordReauditResults writes scoreAfter and computes lift", async () => {
    await recordReauditResults(liftTaskId, reauditId, 65);

    const [row] = await client`
      SELECT score_before, score_after, reaudit_id, lift_achieved
      FROM remediation_tasks WHERE id = ${liftTaskId}
    `;
    expect(Number(row.score_before)).toBe(40);
    expect(Number(row.score_after)).toBe(65);
    expect(row.reaudit_id).toBe(reauditId);
    expect(Number(row.lift_achieved)).toBe(25);
  });

  it("recordReauditResults with null scoreBefore yields null lift", async () => {
    const task = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      title: "No scoreBefore task",
    }, serviceDb);
    createdIds.remediationTasks.push(task.id);

    await recordReauditResults(task.id, reauditId, 50);

    const [row] = await client`
      SELECT score_before, lift_achieved FROM remediation_tasks WHERE id = ${task.id}
    `;
    expect(row.score_before).toBeNull();
    expect(row.lift_achieved).toBeNull();
  });
});

describe("BE-1: content_drafts table + status default", () => {
  it("inserts a content draft with default status 'draft'", async () => {
    const [draft] = await client`
      INSERT INTO content_drafts (
        organization_id, brand_id, draft_type, content_format, title, body
      )
      VALUES (${orgAId}, ${brandAId}, 'expert_article', 'expert_article', 'Test Draft', 'Draft body content')
      RETURNING id, status
    `;
    expect(draft.status).toBe("draft");
    createdIds.contentDrafts.push(draft.id);
  });

  it("content_drafts.status accepts all valid values", async () => {
    for (const status of ["draft", "approved", "published", "rejected"]) {
      const [d] = await client`
        INSERT INTO content_drafts (
          organization_id, brand_id, draft_type, content_format, title, body, status
        )
        VALUES (${orgAId}, ${brandAId}, 'expert_article', 'expert_article', ${`Status ${status}`}, 'body', ${status})
        RETURNING id, status
      `;
      expect(d.status).toBe(status);
      createdIds.contentDrafts.push(d.id);
    }
  });
});

describe("BE-1: markReauditDeferred", () => {
  it("sets reaudit_deferred_reason on the task", async () => {
    const task = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      title: "Deferred test task",
    }, serviceDb);
    createdIds.remediationTasks.push(task.id);

    await markReauditDeferred(task.id, "quota_exceeded", serviceDb);

    const [row] = await client`
      SELECT reaudit_deferred_reason FROM remediation_tasks WHERE id = ${task.id}
    `;
    expect(row.reaudit_deferred_reason).toBe("quota_exceeded");
  });
});

// ═══════════════════════════════════════════════════════════════
// BE-2: Error Paths, Edge Cases, Idempotency
// ═══════════════════════════════════════════════════════════════

describe("BE-2: updateTaskStatus — error paths", () => {
  let errorTaskId: string;

  beforeAll(async () => {
    const task = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      title: "Error path test task",
    }, serviceDb);
    errorTaskId = task.id;
    createdIds.remediationTasks.push(errorTaskId);
  });

  it("rejects invalid status value", async () => {
    await expect(updateTaskStatus(errorTaskId, "done", undefined, serviceDb)).rejects.toThrow(
      "Invalid status: done",
    );
  });

  it("rejects open → complete (skipping intermediate states)", async () => {
    await expect(updateTaskStatus(errorTaskId, "complete", undefined, serviceDb)).rejects.toThrow(
      "Cannot transition from 'open' to 'complete'",
    );
  });

  it("rejects open → ready_for_review", async () => {
    await expect(
      updateTaskStatus(errorTaskId, "ready_for_review", undefined, serviceDb),
    ).rejects.toThrow("Cannot transition from 'open' to 'ready_for_review'");
  });

  it("rejects wont_fix without reason", async () => {
    await expect(
      updateTaskStatus(errorTaskId, "wont_fix", undefined, serviceDb),
    ).rejects.toThrow("wont_fix_reason is required");
  });

  it("accepts wont_fix with reason", async () => {
    const updated = await updateTaskStatus(
      errorTaskId,
      "wont_fix",
      "Not applicable to this brand",
      serviceDb,
    );
    expect(updated.status).toBe("wont_fix");
    expect(updated.wontFixReason).toBe("Not applicable to this brand");
  });

  it("wont_fix → open (reopen) works", async () => {
    const updated = await updateTaskStatus(errorTaskId, "open", undefined, serviceDb);
    expect(updated.status).toBe("open");
  });

  it("rejects non-existent task ID", async () => {
    await expect(
      updateTaskStatus("00000000-0000-0000-0000-000000000000", "in_progress", undefined, serviceDb),
    ).rejects.toThrow("Task not found");
  });
});

describe("BE-2: findExistingTaskForRecommendation — dedup guard", () => {
  let dedupTaskId: string;

  beforeAll(async () => {
    const task = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      recommendationId: recAId,
      title: "Dedup target task",
    }, serviceDb);
    dedupTaskId = task.id;
    createdIds.remediationTasks.push(dedupTaskId);
  });

  it("finds existing open task for the same recommendation", async () => {
    const existing = await findExistingTaskForRecommendation(recAId, serviceDb);
    expect(existing).toBeTruthy();
    expect(existing!.id).toBe(dedupTaskId);
  });

  it("returns null after task is completed (terminal state skipped)", async () => {
    await updateTaskStatus(dedupTaskId, "in_progress", undefined, serviceDb);
    await updateTaskStatus(dedupTaskId, "ready_for_review", undefined, serviceDb);
    await updateTaskStatus(dedupTaskId, "complete", undefined, serviceDb);

    const existing = await findExistingTaskForRecommendation(recAId, serviceDb);
    expect(existing).toBeNull();
  });
});

describe("BE-2: createTaskFromRecommendation — idempotent dedup (MI-01)", () => {
  let firstTaskId: string;

  beforeAll(async () => {
    // Create a second recommendation for this test (unique audit+key combo)
    const [rec2] = await client`
      INSERT INTO action_items (
        organization_id, brand_id, audit_id, recommendation_key, dimension,
        title, action, confidence_label, expected_impact_score
      )
      VALUES (
        ${orgAId}, ${brandAId}, ${auditAId}, 'faq-block', 'content',
        'Add FAQ block', 'Add an FAQ block to homepage',
        'likely', 'medium'
      )
      RETURNING id
    `;
    createdIds.actionItems.push(rec2.id);

    const { task } = await createTaskFromRecommendation(
      rec2.id,
      orgAId,
      brandAId,
      serviceDb,
    );
    firstTaskId = task.id as string;
    createdIds.remediationTasks.push(firstTaskId);
  });

  it("second call returns existing: true (no duplicate task)", async () => {
    const rec2Id = createdIds.actionItems[createdIds.actionItems.length - 1];
    const { task, existing } = await createTaskFromRecommendation(
      rec2Id,
      orgAId,
      brandAId,
      serviceDb,
    );
    expect(existing).toBe(true);
    expect(task.id).toBe(firstTaskId);
  });
});

// ═══════════════════════════════════════════════════════════════
// BE-2: RLS Isolation Tests (non-superuser role)
// ═══════════════════════════════════════════════════════════════

describe("BE-2: RLS isolation on Sprint 2 tables", () => {
  let rlsClient: ReturnType<typeof postgres>;
  const rlsTaskIds: string[] = [];
  const rlsRunIds: string[] = [];
  const rlsDraftIds: string[] = [];

  beforeAll(async () => {
    // Create rls_test_role if not exists + grant on Sprint 2 tables
    await client`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_role') THEN
          CREATE ROLE rls_test_role LOGIN PASSWORD 'rls_test_pass';
        END IF;
      END $$
    `;
    await client`GRANT USAGE ON SCHEMA public TO rls_test_role`;
    await client`GRANT SELECT, INSERT, UPDATE, DELETE ON remediation_tasks TO rls_test_role`;
    await client`GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_runs TO rls_test_role`;
    await client`GRANT SELECT, INSERT, UPDATE, DELETE ON content_drafts TO rls_test_role`;

    // Seed data as superuser: one row per org in each table
    const [taskA] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, priority, status)
      VALUES (${orgAId}, ${brandAId}, 'RLS Task Org A', 50, 'open')
      RETURNING id
    `;
    const [taskB] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, priority, status)
      VALUES (${orgBId}, ${brandBId}, 'RLS Task Org B', 50, 'open')
      RETURNING id
    `;
    rlsTaskIds.push(taskA.id, taskB.id);
    createdIds.remediationTasks.push(taskA.id, taskB.id);

    const [runA] = await client`
      INSERT INTO workflow_runs (organization_id, brand_id, workflow_type, status, scheduled_for)
      VALUES (${orgAId}, ${brandAId}, 'weekly_audit', 'scheduled', NOW())
      RETURNING id
    `;
    const [runB] = await client`
      INSERT INTO workflow_runs (organization_id, brand_id, workflow_type, status, scheduled_for)
      VALUES (${orgBId}, ${brandBId}, 'weekly_audit', 'scheduled', NOW())
      RETURNING id
    `;
    rlsRunIds.push(runA.id, runB.id);
    createdIds.workflowRuns.push(runA.id, runB.id);

    const [draftA] = await client`
      INSERT INTO content_drafts (organization_id, brand_id, draft_type, content_format, title, body)
      VALUES (${orgAId}, ${brandAId}, 'expert_article', 'expert_article', 'RLS Draft A', 'Body A')
      RETURNING id
    `;
    const [draftB] = await client`
      INSERT INTO content_drafts (organization_id, brand_id, draft_type, content_format, title, body)
      VALUES (${orgBId}, ${brandBId}, 'expert_article', 'expert_article', 'RLS Draft B', 'Body B')
      RETURNING id
    `;
    rlsDraftIds.push(draftA.id, draftB.id);
    createdIds.contentDrafts.push(draftA.id, draftB.id);

    // Connect as rls_test_role
    rlsClient = postgres(
      TEST_DB_URL.replace("postgres:password", "rls_test_role:rls_test_pass"),
      { max: 1 },
    );
  }, 30_000);

  afterAll(async () => {
    if (rlsClient) await rlsClient.end();
  });

  // -- remediation_tasks RLS --

  it("rls_test_role + org_A context sees only org_A remediation_tasks", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${orgAId}, false)`;
    const rows = await rlsClient`
      SELECT id, organization_id FROM remediation_tasks WHERE id = ANY(${rlsTaskIds})
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(orgAId);
  });

  it("rls_test_role + org_B context sees only org_B remediation_tasks", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${orgBId}, false)`;
    const rows = await rlsClient`
      SELECT id, organization_id FROM remediation_tasks WHERE id = ANY(${rlsTaskIds})
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(orgBId);
  });

  it("rls_test_role + bogus org_id sees 0 remediation_tasks", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${"00000000-0000-0000-0000-000000000000"}, false)`;
    const rows = await rlsClient`
      SELECT id FROM remediation_tasks WHERE id = ANY(${rlsTaskIds})
    `;
    expect(rows).toHaveLength(0);
  });

  // -- workflow_runs RLS --

  it("rls_test_role + org_A context sees only org_A workflow_runs", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${orgAId}, false)`;
    const rows = await rlsClient`
      SELECT id, organization_id FROM workflow_runs WHERE id = ANY(${rlsRunIds})
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(orgAId);
  });

  it("rls_test_role + org_B context sees only org_B workflow_runs", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${orgBId}, false)`;
    const rows = await rlsClient`
      SELECT id, organization_id FROM workflow_runs WHERE id = ANY(${rlsRunIds})
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(orgBId);
  });

  it("rls_test_role + bogus org_id sees 0 workflow_runs", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${"00000000-0000-0000-0000-000000000000"}, false)`;
    const rows = await rlsClient`
      SELECT id FROM workflow_runs WHERE id = ANY(${rlsRunIds})
    `;
    expect(rows).toHaveLength(0);
  });

  // -- content_drafts RLS --

  it("rls_test_role + org_A context sees only org_A content_drafts", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${orgAId}, false)`;
    const rows = await rlsClient`
      SELECT id, organization_id FROM content_drafts WHERE id = ANY(${rlsDraftIds})
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(orgAId);
  });

  it("rls_test_role + org_B context sees only org_B content_drafts", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${orgBId}, false)`;
    const rows = await rlsClient`
      SELECT id, organization_id FROM content_drafts WHERE id = ANY(${rlsDraftIds})
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(orgBId);
  });

  it("rls_test_role + bogus org_id sees 0 content_drafts", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${"00000000-0000-0000-0000-000000000000"}, false)`;
    const rows = await rlsClient`
      SELECT id FROM content_drafts WHERE id = ANY(${rlsDraftIds})
    `;
    expect(rows).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// BE-2: Brand isolation — tasks are scoped to brandId
// ═══════════════════════════════════════════════════════════════

describe("BE-2: brand isolation — getTasksByBrand filters correctly", () => {
  beforeAll(async () => {
    // Create tasks under different brands
    const tA = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      title: "Brand A task for isolation test",
    }, serviceDb);
    const tB = await createTask({
      organizationId: orgBId,
      brandId: brandBId,
      title: "Brand B task for isolation test",
    }, serviceDb);
    createdIds.remediationTasks.push(tA.id, tB.id);
  });

  it("getTasksByBrand(brandA) does not return brandB tasks", async () => {
    const tasks = await getTasksByBrand(brandAId, undefined, serviceDb);
    const hasBrandB = tasks.some((t) => t.brandId === brandBId);
    expect(hasBrandB).toBe(false);
  });

  it("getTasksByBrand(brandB) does not return brandA tasks", async () => {
    const tasks = await getTasksByBrand(brandBId, undefined, serviceDb);
    const hasBrandA = tasks.some((t) => t.brandId === brandAId);
    expect(hasBrandA).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// BE-3: Cross-Sprint Gaps (Sprint 1 → 2 interactions)
// ═══════════════════════════════════════════════════════════════

describe("BE-3: audit (Sprint 1) → recommendation → task FK chain", () => {
  it("createTaskFromRecommendation creates a task linked to Sprint 1 audit + recommendation", async () => {
    const { task, existing } = await createTaskFromRecommendation(
      recAId,
      orgAId,
      brandAId,
      serviceDb,
    );

    if (!existing) {
      createdIds.remediationTasks.push(task.id as string);
    }

    const [row] = await client`
      SELECT audit_id, recommendation_id, recommendation_key
      FROM remediation_tasks WHERE id = ${task.id}
    `;
    expect(row.audit_id).toBe(auditAId);
    expect(row.recommendation_id).toBe(recAId);
    expect(row.recommendation_key).toBe("press-release");
  });
});

describe("BE-3: audit ON DELETE SET NULL cascades to tasks", () => {
  let cascadeAuditId: string;
  let cascadeTaskId: string;

  beforeAll(async () => {
    const [audit] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, triggered_by)
      VALUES (${brandAId}, ${orgAId}, 99803, ARRAY['chatgpt'], 'complete', 'manual')
      RETURNING id
    `;
    cascadeAuditId = audit.id;

    const task = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      auditId: cascadeAuditId,
      title: "Cascade test task",
    }, serviceDb);
    cascadeTaskId = task.id;
    createdIds.remediationTasks.push(cascadeTaskId);
  });

  it("deleting the audit sets task.audit_id to NULL", async () => {
    await client`DELETE FROM audits WHERE id = ${cascadeAuditId}`;

    const [row] = await client`
      SELECT audit_id FROM remediation_tasks WHERE id = ${cascadeTaskId}
    `;
    expect(row.audit_id).toBeNull();
  });
});

describe("BE-3: recommendation ON DELETE SET NULL cascades to tasks", () => {
  let cascadeRecId: string;
  let cascadeTaskId: string;

  beforeAll(async () => {
    const [rec] = await client`
      INSERT INTO action_items (
        organization_id, brand_id, audit_id, recommendation_key, dimension,
        title, action, confidence_label, expected_impact_score
      )
      VALUES (
        ${orgAId}, ${brandAId}, ${auditAId}, 'how-to-guide', 'content',
        'Write how-to', 'Create a how-to guide',
        'confirmed', 'high'
      )
      RETURNING id
    `;
    cascadeRecId = rec.id;

    const task = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      recommendationId: cascadeRecId,
      title: "Rec cascade test task",
    }, serviceDb);
    cascadeTaskId = task.id;
    createdIds.remediationTasks.push(cascadeTaskId);
  });

  it("deleting the recommendation sets task.recommendation_id to NULL", async () => {
    await client`DELETE FROM action_items WHERE id = ${cascadeRecId}`;

    const [row] = await client`
      SELECT recommendation_id FROM remediation_tasks WHERE id = ${cascadeTaskId}
    `;
    expect(row.recommendation_id).toBeNull();
  });
});

describe("BE-3: content_draft FK to remediation_task ON DELETE SET NULL", () => {
  let draftTaskId: string;
  let draftId: string;

  beforeAll(async () => {
    const task = await createTask({
      organizationId: orgAId,
      brandId: brandAId,
      title: "Draft FK test task",
    }, serviceDb);
    draftTaskId = task.id;
    createdIds.remediationTasks.push(draftTaskId);

    const [draft] = await client`
      INSERT INTO content_drafts (
        organization_id, brand_id, task_id, draft_type, content_format, title, body
      )
      VALUES (${orgAId}, ${brandAId}, ${draftTaskId}, 'expert_article', 'expert_article', 'FK Draft', 'body')
      RETURNING id
    `;
    draftId = draft.id;
    createdIds.contentDrafts.push(draftId);
  });

  it("deleting the task sets content_draft.task_id to NULL", async () => {
    // Remove from tracking so afterAll doesn't try to delete it twice
    createdIds.remediationTasks = createdIds.remediationTasks.filter(
      (id) => id !== draftTaskId,
    );
    await client`DELETE FROM remediation_tasks WHERE id = ${draftTaskId}`;

    const [row] = await client`
      SELECT task_id FROM content_drafts WHERE id = ${draftId}
    `;
    expect(row.task_id).toBeNull();
  });
});

describe("BE-3: Inngest function registration — Sprint 2 functions present", () => {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const serveSource = fs.readFileSync(
    path.resolve("app/api/webhooks/inngest/route.ts"),
    "utf-8",
  );

  it("serve() registers generateContentDraft", () => {
    expect(serveSource).toContain("generateContentDraft");
  });

  it("serve() registers triggerValidationReaudit", () => {
    expect(serveSource).toContain("triggerValidationReaudit");
  });

  it("serve() registers scheduleWorkflowRuns", () => {
    expect(serveSource).toContain("scheduleWorkflowRuns");
  });

  it("generate-content-draft triggers on 'draft/generate' event", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/generate-content-draft.ts"),
      "utf-8",
    );
    expect(source).toContain('"draft/generate"');
  });

  it("trigger-validation-reaudit triggers on 'task/completed' event (audit.run not audit/start)", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/trigger-validation-reaudit.ts"),
      "utf-8",
    );
    expect(source).toContain('"task/completed"');
    expect(source).not.toContain("audit/start");
  });

  it("schedule-workflow-runs uses cron trigger", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/schedule-workflow-runs.ts"),
      "utf-8",
    );
    expect(source).toContain("cron:");
  });
});
