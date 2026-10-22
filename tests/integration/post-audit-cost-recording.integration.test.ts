/**
 * "Inngest: fit within the 5 concurrent steps of the free plan",
 * item 3 -- simulate-query-fan-out.ts and run-comparison-prompts.ts
 * make real, paid LLM calls AFTER an audit already finished, and
 * neither one's cost was ever recorded anywhere before this.
 * BudgetPolicyService.record() now takes a `source`, and migration
 * 0094 widened audit_cost_snapshots' unique index from (audit_id)
 * alone to (audit_id, source) so a real audit can have more than one
 * snapshot row (its own, plus one per post-audit function that
 * actually spent money) without one source's row silently dropping
 * another's.
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
let nextAuditNumber = 1;

async function seedAudit() {
  const auditId = randomUUID();
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, total_cost_usd)
    VALUES (${auditId}, ${BRAND_ID}, ${ORG_ID}, ${nextAuditNumber++}, 'manual', 'complete', '0.5000')
  `;
  return auditId;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`post-audit-cost-${ORG_ID}`}, 'Post Audit Cost Test Org', ${`post-audit-cost-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Post Audit Cost Co', 'postauditcost.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
});

afterAll(async () => {
  await client`DELETE FROM audit_cost_snapshots WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
});

describe("BudgetPolicyService.record() with a source -- a real audit can have more than one real snapshot row", () => {
  it("the audit's own record() (source: 'audit', the default) and a post-audit function's record() produce TWO separate rows, not one overwriting the other", async () => {
    const { BudgetPolicyService } = await import("@/lib/platform/budget-policy.service");
    const auditId = await seedAudit();

    await BudgetPolicyService.record(auditId, 0.5); // the audit itself, default source
    await BudgetPolicyService.record(auditId, 0.1, "simulate-query-fan-out");
    await BudgetPolicyService.record(auditId, 0.05, "run-comparison-prompts");

    const rows = await client<{ source: string; actual_cost_cents: number }[]>`
      SELECT source, actual_cost_cents FROM audit_cost_snapshots WHERE audit_id = ${auditId} ORDER BY source
    `;
    expect(rows.map((r) => r.source)).toEqual(["audit", "run-comparison-prompts", "simulate-query-fan-out"]);
    expect(rows.every((r) => r.actual_cost_cents > 0)).toBe(true);
  });

  it("a replay (the SAME source called twice) is still a no-op -- exactly one row per source, the first cost wins", async () => {
    const { BudgetPolicyService } = await import("@/lib/platform/budget-policy.service");
    const auditId = await seedAudit();

    await BudgetPolicyService.record(auditId, 0.1, "simulate-query-fan-out");
    await BudgetPolicyService.record(auditId, 0.99, "simulate-query-fan-out"); // a replay with a different number

    const rows = await client<{ actual_cost_cents: number }[]>`
      SELECT actual_cost_cents FROM audit_cost_snapshots
      WHERE audit_id = ${auditId} AND source = 'simulate-query-fan-out'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].actual_cost_cents).toBe(Math.round(0.1 * (100 / 0.65)));
  });

  it("checkDailySpend's sum includes every source for the org, not just the audit's own", async () => {
    const { BudgetPolicyService } = await import("@/lib/platform/budget-policy.service");
    const auditId = await seedAudit();

    await BudgetPolicyService.record(auditId, 0.5, "audit");
    await BudgetPolicyService.record(auditId, 0.2, "simulate-query-fan-out");
    await BudgetPolicyService.record(auditId, 0.1, "run-comparison-prompts");

    const result = await BudgetPolicyService.checkDailySpend(ORG_ID, 999_999);
    // At least the 0.8 USD across all three sources for this one audit
    // (converted to AU cents) -- >= rather than exact equality, since
    // this org may have other rows from the other tests in this file.
    const expectedMinCents = Math.round(0.8 * (100 / 0.65)) - 1; // -1 for rounding slack across 3 separate conversions
    expect(result.spentTodayCents).toBeGreaterThanOrEqual(expectedMinCents);
  });

  it("a post-audit function's FIRST successful record() adds its cost onto audits.total_cost_usd (the owner-facing figure); the audit's own 'audit' source never re-adds to it", async () => {
    const { BudgetPolicyService } = await import("@/lib/platform/budget-policy.service");
    const auditId = await seedAudit(); // seeded with total_cost_usd = 0.5000, as if the audit itself already finalized

    await BudgetPolicyService.record(auditId, 0.5, "audit"); // the audit's own source -- must NOT re-add, already reflected
    await BudgetPolicyService.record(auditId, 0.25, "simulate-query-fan-out"); // must add

    const [row] = await client<{ total_cost_usd: string }[]>`
      SELECT total_cost_usd FROM audits WHERE id = ${auditId}
    `;
    expect(Number(row.total_cost_usd)).toBeCloseTo(0.75, 4); // 0.5 (seeded) + 0.25 (post-audit), never 1.0 or 0.5
  });

  it("a replayed post-audit record() does NOT double-add to audits.total_cost_usd", async () => {
    const { BudgetPolicyService } = await import("@/lib/platform/budget-policy.service");
    const auditId = await seedAudit();

    await BudgetPolicyService.record(auditId, 0.25, "simulate-query-fan-out");
    await BudgetPolicyService.record(auditId, 0.25, "simulate-query-fan-out"); // replay, same source

    const [row] = await client<{ total_cost_usd: string }[]>`
      SELECT total_cost_usd FROM audits WHERE id = ${auditId}
    `;
    expect(Number(row.total_cost_usd)).toBeCloseTo(0.75, 4); // 0.5 (seeded) + 0.25 ONCE, never 1.0
  });
});
