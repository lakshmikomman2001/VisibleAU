/**
 * Task #46 (15th follow-up), Part C -- real-DB proof that
 * `loadScopedOrAbort()` actually stops an Inngest function cold when the
 * event payload disagrees with the row it loads: no further reads/writes
 * happen, matching "single trusted sender" NOT holding (exactly the shape
 * generate-content-draft.ts's taskId turned out to be, in the 14th
 * follow-up).
 *
 * Two representative functions, chosen for different shapes and
 * different mismatch dimensions:
 * - detect-drift.ts (one of the 6 `audit.complete` functions): the
 *   realistic exploit here is same-ORG, wrong-BRAND -- an attacker-
 *   supplied `brandId` for a DIFFERENT, real brand in the SAME org. A
 *   wrong organizationId alone is already caught by RLS on the
 *   "previous audit" lookup (accidental, not by design) before any write
 *   is reached, so that scenario alone wouldn't distinguish old code
 *   from new code; the cross-brand case does, because RLS has no
 *   brand-level policy to fall back on.
 * - bulk-reaudit-orchestrate.ts (different entity -- operationId on
 *   bulk_operations): a wrong organizationId, which RLS alone does NOT
 *   catch here, because the old code uses the EVENT's org for every
 *   query, never the row's own, so a wrong org just silently operates
 *   somewhere real orgs should never let it.
 *
 * Calls each function's real handler directly via the `.fn` property
 * (same pattern as generate-content-draft-cross-tenant.integration.test.ts
 * in the 14th follow-up), with a minimal `step.run()` stub that just
 * invokes its callback -- neither function under test uses step.sleep or
 * step.waitForEvent.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const REAL_ORG_ID = randomUUID();
const REAL_BRAND_ID = randomUUID();
const REAL_AUDIT_ID = randomUUID();
const DECOY_BRAND_ID = randomUUID();
const DECOY_PREVIOUS_AUDIT_ID = randomUUID();

const BULK_ORG_ID = randomUUID();
const BULK_OPERATION_ID = randomUUID();
const BULK_ATTACKER_ORG_ID = randomUUID();

let client: ReturnType<typeof postgres>;

const step = { run: (_name: string, fn: () => unknown) => fn() };

beforeAll(async () => {
  client = postgres(getTestDatabaseUrl(), { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, tier, region)
    VALUES
      (${REAL_ORG_ID}, ${`isg-org-${REAL_ORG_ID}`}, 'Scope Guard Real Org', 'free', 'au'),
      (${BULK_ORG_ID}, ${`isg-bulk-${BULK_ORG_ID}`}, 'Scope Guard Bulk Org', 'free', 'au'),
      (${BULK_ATTACKER_ORG_ID}, ${`isg-bulk-attacker-${BULK_ATTACKER_ORG_ID}`}, 'Scope Guard Bulk Attacker Org', 'free', 'au')
  `;

  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES
      (${REAL_BRAND_ID}, ${REAL_ORG_ID}, 'Scope Guard Real Brand', ${`isg-real-${randomUUID()}.example.com`}, 'tradies', 'au', ARRAY['NSW:Sydney']),
      (${DECOY_BRAND_ID}, ${REAL_ORG_ID}, 'Scope Guard Decoy Brand', ${`isg-decoy-${randomUUID()}.example.com`}, 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;

  // The audit actually being completed (brand A).
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, score_composite)
    VALUES (${REAL_AUDIT_ID}, ${REAL_BRAND_ID}, ${REAL_ORG_ID}, 1, 'complete', 80.0)
  `;
  // A real, unrelated prior audit for a DIFFERENT brand (B) in the same
  // org -- old code would happily treat this as brand A's "previous"
  // audit if the event's brandId claimed brand B instead of brand A.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, score_composite)
    VALUES (${DECOY_PREVIOUS_AUDIT_ID}, ${DECOY_BRAND_ID}, ${REAL_ORG_ID}, 2, 'complete', 40.0)
  `;

  await client`
    INSERT INTO bulk_operations (id, organization_id, operation_type, status, total_brands)
    VALUES (${BULK_OPERATION_ID}, ${BULK_ORG_ID}, 'reaudit', 'pending', 1)
  `;
});

afterAll(async () => {
  await client`DELETE FROM drift_alerts WHERE current_audit_id = ${REAL_AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id IN (${REAL_AUDIT_ID}, ${DECOY_PREVIOUS_AUDIT_ID})`;
  await client`DELETE FROM audits WHERE organization_id IN (${BULK_ORG_ID}, ${BULK_ATTACKER_ORG_ID})`;
  await client`DELETE FROM brands WHERE id IN (${REAL_BRAND_ID}, ${DECOY_BRAND_ID})`;
  await client`DELETE FROM bulk_operations WHERE id = ${BULK_OPERATION_ID}`;
  await client`DELETE FROM organizations WHERE id IN (${REAL_ORG_ID}, ${BULK_ORG_ID}, ${BULK_ATTACKER_ORG_ID})`;
  await client.end();
});

describe("detect-drift.ts -- a payload claiming a different (but real) brandId aborts with no writes", () => {
  it("never computes drift against a decoy brand's audit and never writes a drift_alerts row", async () => {
    const { detectDriftFn } = await import("@/inngest/functions/detect-drift");
    type Handler = (ctx: {
      event: { data: { auditId: string; brandId?: string; organizationId?: string } };
      step: typeof step;
    }) => Promise<unknown>;

    const result = await (detectDriftFn as unknown as { fn: Handler }).fn({
      event: {
        data: { auditId: REAL_AUDIT_ID, organizationId: REAL_ORG_ID, brandId: DECOY_BRAND_ID },
      },
      step,
    });

    expect(result).toMatchObject({ skipped: true });

    const alerts =
      await client`SELECT id FROM drift_alerts WHERE current_audit_id = ${REAL_AUDIT_ID}`;
    expect(alerts.length).toBe(0);
  });
});

describe("bulk-reaudit-orchestrate.ts -- mismatched event organizationId aborts with no writes", () => {
  it("a payload claiming a different org than the operation's real org creates no audits and never flips the operation's status", async () => {
    const { bulkReauditOrchestrate } = await import("@/inngest/functions/bulk-reaudit-orchestrate");
    type Handler = (ctx: {
      event: { data: { brandIds: string[]; organizationId: string; operationId: string } };
      step: typeof step;
    }) => Promise<unknown>;

    const result = await (bulkReauditOrchestrate as unknown as { fn: Handler }).fn({
      event: {
        data: {
          brandIds: [randomUUID()],
          organizationId: BULK_ATTACKER_ORG_ID,
          operationId: BULK_OPERATION_ID,
        },
      },
      step,
    });

    expect(result).toMatchObject({ skipped: true });

    const [op] = await client`SELECT status FROM bulk_operations WHERE id = ${BULK_OPERATION_ID}`;
    expect(op.status).toBe("pending");

    const createdAudits = await client`
      SELECT id FROM audits WHERE organization_id IN (${BULK_ORG_ID}, ${BULK_ATTACKER_ORG_ID})
    `;
    expect(createdAudits.length).toBe(0);
  });
});
