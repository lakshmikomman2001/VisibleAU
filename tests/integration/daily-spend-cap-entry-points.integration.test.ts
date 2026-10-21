/**
 * "Make the daily spend cap real", item 2 -- an org already at
 * DAILY_SPEND_CAP_CENTS must have its next audit blocked, with a
 * clear reason, on every entry point that can start one -- not just
 * the one path (lib/audit/run-audit-inline.ts's own internal check)
 * that already checked before this task. No entry point should
 * create an orphan audit row or make an engine call once the cap is
 * known to be exceeded.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();

let client: ReturnType<typeof postgres>;
let nextAuditNumber = 1;

const step = {
  run: (_name: string, fn: () => unknown) => fn(),
  sleep: async () => {},
  sendEvent: async () => ({ ids: [] }),
};

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`cap-entry-${ORG_ID}`}, 'Daily Cap Entry Test Org', ${`cap-entry-org-${ORG_ID}`})
  `;
  // Confirmed brand -- passes brandReadyForAudit at every entry point,
  // so the daily-cap check is what actually fires in every test here,
  // not an earlier, unrelated gate.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Daily Cap Entry Co', 'dailycapentry.example.com.au', 'tradies', 'au',
      ARRAY[]::text[],
      'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
  // enterprise -- an unlimited audits-per-month tier (lib/scheduling/
  // tier-limits.ts), so checkQuota() never fires first and masks the
  // daily-cap check this file actually tests.
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'enterprise', 'monthly', 'active')
  `;
  // Already at today's cap -- DEFAULT_DAILY_SPEND_CAP_CENTS is
  // AU$100/day/org (lib/platform/budget-policy.service.ts); one
  // snapshot well over that, dated now, is enough regardless of what
  // DAILY_SPEND_CAP_CENTS is overridden to in this environment.
  const priorAuditId = randomUUID();
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, completed_at)
    VALUES (${priorAuditId}, ${BRAND_ID}, ${ORG_ID}, ${nextAuditNumber++}, 'manual', 'complete', now())
  `;
  await client`
    INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale, estimated_cost_cents, actual_cost_cents, prompt_count, provider_call_count)
    VALUES (${priorAuditId}, ${ORG_ID}, 'AU_EN', 'en-AU', 0, 999999, 0, 0)
  `;
});

afterAll(async () => {
  await client`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM remediation_tasks WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM audit_cost_snapshots WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ${ORG_ID})`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function auditCountForOrg() {
  const [{ count }] = await client<{ count: string }[]>`
    SELECT count(*) FROM audits WHERE organization_id = ${ORG_ID}
  `;
  return Number(count);
}

describe("app/api/audits/route.ts -- the manual 'Run audit' button / API", () => {
  it("returns 429 with a clear message, before inngest.send() and before creating any audit row", async () => {
    const before = await auditCountForOrg();

    const { POST } = await import("@/app/api/audits/route");
    const req = new Request("http://localhost/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: BRAND_ID }),
    });
    const res = await POST(req);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({
      error: "daily_spend_cap_exceeded",
      message: "Daily spending limit reached; audits resume tomorrow.",
    });
    expect(await auditCountForOrg()).toBe(before);
  });
});

describe("lib/audit/run-audit-inline.ts -- the second, internal check (defence in depth)", () => {
  it("fails the audit with a stable errorCode and the clear owner-facing message, with no engine calls made", async () => {
    const auditId = randomUUID();
    await client`
      INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status)
      VALUES (${auditId}, ${BRAND_ID}, ${ORG_ID}, ${nextAuditNumber++}, 'manual', 'pending')
    `;

    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
    await runAuditInline(auditId);

    const [audit] = await client<{ status: string; metadata: Record<string, unknown> }[]>`
      SELECT status, metadata FROM audits WHERE id = ${auditId}
    `;
    expect(audit.status).toBe("failed");
    expect(audit.metadata.errorCode).toBe("DailySpendCapExceededError");
    expect(audit.metadata.error).toBe("Daily spending limit reached; audits resume tomorrow.");

    // No engine calls -- the gate fired before any LLM call, same
    // proof tests/integration/run-audit-needs-confirmation.
    // integration.test.ts uses for the confirmation gate.
    const citationRows = await client`SELECT * FROM citations WHERE audit_id = ${auditId}`;
    expect(citationRows.length).toBe(0);
  });
});

describe("inngest/functions/trigger-validation-reaudit.ts", () => {
  it("defers the re-audit with reason daily_spend_cap_exceeded, and never creates an audit row", async () => {
    const taskId = randomUUID();
    await client`
      INSERT INTO remediation_tasks (id, organization_id, brand_id, title, priority)
      VALUES (${taskId}, ${ORG_ID}, ${BRAND_ID}, 'Fix something', 50)
    `;
    const before = await auditCountForOrg();

    const { triggerValidationReaudit } = await import(
      "@/inngest/functions/trigger-validation-reaudit"
    );
    type Handler = (ctx: {
      event: { data: { taskId: string; brandId: string; orgId: string } };
      step: typeof step;
    }) => Promise<unknown>;
    const result = await (triggerValidationReaudit as unknown as { fn: Handler }).fn({
      event: { data: { taskId, brandId: BRAND_ID, orgId: ORG_ID } },
      step,
    });

    expect(result).toEqual({ deferred: true, reason: "daily_spend_cap_exceeded" });
    expect(await auditCountForOrg()).toBe(before);

    const [task] = await client<{ reaudit_deferred_reason: string | null }[]>`
      SELECT reaudit_deferred_reason FROM remediation_tasks WHERE id = ${taskId}
    `;
    expect(task.reaudit_deferred_reason).toBe("daily_spend_cap_exceeded");
  });
});
