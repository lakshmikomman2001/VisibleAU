/**
 * Vunnara Build 1 follow-up (entry-point check) -- real-DB proof that
 * the three remaining background audit-creation entry points skip an
 * unconfirmed brand cleanly, rather than silently miscounting it as
 * "completed" (runAuditInline() never throws, so each of these
 * functions' own try/catch would otherwise see a normal return and
 * report success for an audit that actually never ran).
 *
 * Calls each function's real handler directly via `.fn`, with a
 * minimal step.run() stub -- same pattern as
 * tests/integration/inngest-scope-guard-abort.integration.test.ts.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();

let client: ReturnType<typeof postgres>;
const step = { run: (_name: string, fn: () => unknown) => fn() };

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`bgentry-${ORG_ID}`}, 'Background Entry Test Org', ${`bgentry-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_growth', 'growth', 'month', 'active')
  `;
  // Unconfirmed brand -- classification_status defaults to 'pending',
  // location_mode defaults to NULL.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Background Entry Co', 'bgentryco.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
});

afterAll(async () => {
  await client`DELETE FROM audits WHERE brand_id = ${BRAND_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("bulk-reaudit-orchestrate.ts -- an unconfirmed brand counts as failedBrands, never completedBrands", () => {
  it("creates no audit row and never reports a confirmation-blocked brand as completed", async () => {
    const operationId = randomUUID();
    await client`
      INSERT INTO bulk_operations (id, organization_id, operation_type, status, total_brands)
      VALUES (${operationId}, ${ORG_ID}, 'reaudit', 'pending', 1)
    `;

    const { bulkReauditOrchestrate } = await import("@/inngest/functions/bulk-reaudit-orchestrate");
    type Handler = (ctx: {
      event: { data: { brandIds: string[]; organizationId: string; operationId: string } };
      step: typeof step;
    }) => Promise<unknown>;

    const result = await (bulkReauditOrchestrate as unknown as { fn: Handler }).fn({
      event: { data: { brandIds: [BRAND_ID], organizationId: ORG_ID, operationId } },
      step,
    });

    expect(result).toMatchObject({ completed: 0, skipped: 1, failed: 0, total: 1 });

    const [op] = await client<{ completed_brands: number; failed_brands: number }[]>`
      SELECT completed_brands, failed_brands FROM bulk_operations WHERE id = ${operationId}
    `;
    expect(op.completed_brands).toBe(0);
    expect(op.failed_brands).toBe(1);

    const audits = await client`SELECT id FROM audits WHERE brand_id = ${BRAND_ID}`;
    expect(audits.length).toBe(0);

    await client`DELETE FROM bulk_operations WHERE id = ${operationId}`;
  });
});

describe("trigger-validation-reaudit.ts -- an unconfirmed brand defers the re-audit, never creates one", () => {
  it("marks the remediation task deferred with 'needs_confirmation' and creates no audit row", async () => {
    const taskId = randomUUID();
    await client`
      INSERT INTO remediation_tasks (id, organization_id, brand_id, title, priority)
      VALUES (${taskId}, ${ORG_ID}, ${BRAND_ID}, 'Test remediation task', 1)
    `;

    const { triggerValidationReaudit } = await import(
      "@/inngest/functions/trigger-validation-reaudit"
    );
    type Handler = (ctx: {
      event: { data: { taskId: string; brandId: string; orgId: string } };
      step: { sleep: (id: string, d: string) => Promise<void>; run: typeof step.run };
    }) => Promise<unknown>;

    const result = await (triggerValidationReaudit as unknown as { fn: Handler }).fn({
      event: { data: { taskId, brandId: BRAND_ID, orgId: ORG_ID } },
      step: { sleep: async () => {}, run: step.run },
    });

    expect(result).toMatchObject({ deferred: true, reason: "needs_confirmation" });

    const [task] = await client<{ reaudit_deferred_reason: string | null; reaudit_id: string | null }[]>`
      SELECT reaudit_deferred_reason, reaudit_id FROM remediation_tasks WHERE id = ${taskId}
    `;
    expect(task.reaudit_deferred_reason).toBe("needs_confirmation");
    expect(task.reaudit_id).toBeNull();

    const audits = await client`SELECT id FROM audits WHERE brand_id = ${BRAND_ID}`;
    expect(audits.length).toBe(0);

    await client`DELETE FROM remediation_tasks WHERE id = ${taskId}`;
  });
});

describe("schedule-workflow-runs.ts -- an unconfirmed brand's workflow run is marked failed, never completed", () => {
  it("marks the workflow run failed with 'needs_confirmation' and creates no audit row", async () => {
    const { createWorkflowRun } = await import("@/lib/workflow/workflow-orchestrator");
    const run = await createWorkflowRun({
      organizationId: ORG_ID,
      brandId: BRAND_ID,
      workflowType: "weekly_audit",
      scheduledFor: new Date(Date.now() - 1000),
    });

    const { scheduleWorkflowRuns } = await import("@/inngest/functions/schedule-workflow-runs");
    type Handler = (ctx: { step: typeof step }) => Promise<unknown>;

    const result = await (scheduleWorkflowRuns as unknown as { fn: Handler }).fn({ step });
    expect(result).toMatchObject({ triggered: 0, skipped: 1, total: 1 });

    const [reloaded] = await client<{ status: string; result_summary: Record<string, unknown> }[]>`
      SELECT status, result_summary FROM workflow_runs WHERE id = ${run.id}
    `;
    expect(reloaded.status).toBe("failed");
    expect(reloaded.result_summary.errorMessage).toBe("needs_confirmation");

    const audits = await client`SELECT id FROM audits WHERE brand_id = ${BRAND_ID}`;
    expect(audits.length).toBe(0);

    await client`DELETE FROM workflow_runs WHERE id = ${run.id}`;
  });
});
