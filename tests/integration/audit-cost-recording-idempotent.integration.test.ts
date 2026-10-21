/**
 * "Make the daily spend cap real", item 1 -- BudgetPolicyService.
 * record() is now called from three places (lib/audit/run-audit-
 * inline.ts and inngest/functions/run-audit.ts's happy paths, and
 * lib/audit/stale-audit-guard.ts's recordCostForTerminalAudit race
 * branch) instead of only the first, so DAILY_SPEND_CAP_CENTS can
 * finally see real spend from the default (Inngest) audit path too
 * -- lib/audit/run-audit-inline.ts was the ONLY caller before this,
 * and it's only ever used as a fallback when inngest.send() itself
 * throws.
 *
 * Proves: a second record() call for the same audit (a retried or
 * replayed Inngest "finalize" step) is a true DB-level no-op --
 * migration 0092's unique index on audit_id plus record()'s own
 * ON CONFLICT (audit_id) DO NOTHING, not just "we only call it once
 * in practice"; the Inngest happy path now writes exactly one real
 * snapshot row end to end; and both runners produce an identical
 * snapshot shape for the same cost, because both call the one shared
 * record() -- never two independently-drifting implementations.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const RUNNABLE_BRAND_ID = randomUUID();

let client: ReturnType<typeof postgres>;

const step = {
  run: (_name: string, fn: () => unknown) => fn(),
  sendEvent: async () => ({ ids: [] }),
};

let nextAuditNumber = 1;

async function seedBareAudit() {
  const auditId = randomUUID();
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, estimated_cost_cents)
    VALUES (${auditId}, ${BRAND_ID}, ${ORG_ID}, ${nextAuditNumber++}, 'manual', 'pending', 50)
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
    VALUES (${ORG_ID}, ${`cost-record-${ORG_ID}`}, 'Cost Record Test Org', ${`cost-record-org-${ORG_ID}`})
  `;
  // Bare brand -- just enough for a FK target; never run through
  // getAuditPrompts(), only used by the bare-audit idempotency tests.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Cost Record Co', 'costrecord.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  // Runnable brand -- confirmed + a tiny real prompt pack, same shape
  // as tests/integration/audit-engine-failure.integration.test.ts,
  // so a real runAudit.fn() can complete end to end.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${RUNNABLE_BRAND_ID}, ${ORG_ID}, 'Cost Record Runnable Co', 'costrecordrunnable.example.com.au', 'tradies', 'au',
      ARRAY[]::text[],
      ${client.json(["Organic test prompt 1 about plumbing"])},
      ${PROMPT_GENERATOR_VERSION},
      'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
});

afterAll(async () => {
  await client`DELETE FROM audit_cost_snapshots WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ${ORG_ID})`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("BudgetPolicyService.record() idempotency (migration 0092's unique index on audit_id)", () => {
  it("a second record() call for the same audit is a no-op -- exactly one row, and the FIRST recorded cost wins, not the last", async () => {
    const { BudgetPolicyService } = await import("@/lib/platform/budget-policy.service");
    const auditId = await seedBareAudit();

    await BudgetPolicyService.record(auditId, 0.1);
    // A second call with a DIFFERENT number -- simulates a retried or
    // replayed "finalize" step recomputing (or re-sending) the same
    // audit's cost. If this silently inserted a second row, the sum
    // the daily cap reads would double-count real spend.
    await BudgetPolicyService.record(auditId, 0.99);

    const rows = await client<{ actual_cost_cents: number }[]>`
      SELECT actual_cost_cents FROM audit_cost_snapshots WHERE audit_id = ${auditId}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].actual_cost_cents).toBe(Math.round(0.1 * (100 / 0.65)));
  });

  it("two different audits recording the SAME cost produce identical snapshot rows (minus id/audit_id/created_at) -- one shared implementation, not two independently-drifting ones", async () => {
    const { BudgetPolicyService } = await import("@/lib/platform/budget-policy.service");
    const auditA = await seedBareAudit();
    const auditB = await seedBareAudit();

    await BudgetPolicyService.record(auditA, 0.25);
    await BudgetPolicyService.record(auditB, 0.25);

    const [rowA] = await client<
      { market_code: string; locale: string; actual_cost_cents: number; prompt_count: number; provider_call_count: number }[]
    >`
      SELECT market_code, locale, actual_cost_cents, prompt_count, provider_call_count
      FROM audit_cost_snapshots WHERE audit_id = ${auditA}
    `;
    const [rowB] = await client<
      { market_code: string; locale: string; actual_cost_cents: number; prompt_count: number; provider_call_count: number }[]
    >`
      SELECT market_code, locale, actual_cost_cents, prompt_count, provider_call_count
      FROM audit_cost_snapshots WHERE audit_id = ${auditB}
    `;
    expect(rowA).toEqual(rowB);
  });

  it(
    "the Inngest happy path (inngest/functions/run-audit.ts) -- previously the only path that NEVER recorded cost at all -- now records exactly one real snapshot row end to end",
    async () => {
      const [{ auditId }] = await client<{ auditId: string }[]>`
        INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
        VALUES (${randomUUID()}, ${RUNNABLE_BRAND_ID}, ${ORG_ID}, ${nextAuditNumber++}, 'manual', 'pending', ${client.json({ mockScenario: "happy_path" })})
        RETURNING id AS "auditId"
      `;

      const { runAudit } = await import("@/inngest/functions/run-audit");
      type Handler = (ctx: {
        event: { data: { auditId: string } };
        step: typeof step;
      }) => Promise<unknown>;
      await (runAudit as unknown as { fn: Handler }).fn({ event: { data: { auditId } }, step });

      const [audit] = await client<{ status: string; total_cost_usd: string }[]>`
        SELECT status, total_cost_usd FROM audits WHERE id = ${auditId}
      `;
      expect(audit.status).toBe("complete");

      const rows = await client<{ actual_cost_cents: number }[]>`
        SELECT actual_cost_cents FROM audit_cost_snapshots WHERE audit_id = ${auditId}
      `;
      expect(rows.length).toBe(1);
      expect(rows[0].actual_cost_cents).toBeGreaterThan(0);
      // The recorded snapshot reflects the SAME total the audit's own
      // header displays -- not a different, independently-drifting
      // number.
      expect(rows[0].actual_cost_cents).toBe(
        Math.round(Number(audit.total_cost_usd) * (100 / 0.65)),
      );
    },
    20_000,
  );
});
