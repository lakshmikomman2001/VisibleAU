/**
 * Vunnara Build 1 follow-up (entry-point check) -- real-DB proof for
 * the most serious gap found: inngest/functions/run-audit.ts (the
 * ASYNC path every "Run audit" click uses once inngest.send()
 * succeeds) caught a thrown error, marked the audit "failed", and
 * THEN RE-THREW it. With `retries: 2` configured, Inngest would retry
 * this exact audit up to 2 more times for a BrandNeedsConfirmationError
 * -- a deterministic failure that can never succeed on retry, since
 * nothing about the brand's confirmation status changes between
 * attempts. This is exactly the "no throw that triggers Inngest
 * retries (×3)" requirement.
 *
 * Calls the function's real handler directly via `.fn`, with a
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
const AUDIT_ID = randomUUID();

let client: ReturnType<typeof postgres>;
let stepRunCallCount = 0;
const step = {
  run: (_name: string, fn: () => unknown) => {
    stepRunCallCount++;
    return fn();
  },
};

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`runaudit-${ORG_ID}`}, 'Run Audit Confirm Test Org', ${`runaudit-org-${ORG_ID}`})
  `;
  // Unconfirmed brand -- classification_status defaults to 'pending',
  // location_mode defaults to NULL. Every existing brand looks like
  // this the moment this push lands.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Unconfirmed Co', 'unconfirmedco.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'manual', 'pending')
  `;
});

afterAll(async () => {
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("run-audit.ts -- a needs-confirmation brand never retries, never throws out of the function", () => {
  it("returns a skipped result instead of throwing, and marks the audit failed with a stable errorCode", async () => {
    const { runAudit } = await import("@/inngest/functions/run-audit");
    type Handler = (ctx: {
      event: { data: { auditId: string } };
      step: typeof step;
    }) => Promise<unknown>;

    // The real assertion: this must not reject/throw. If it did,
    // Inngest's retries: 2 would re-run this exact audit up to 2 more
    // times for a failure that can never succeed.
    const result = await (runAudit as unknown as { fn: Handler }).fn({
      event: { data: { auditId: AUDIT_ID } },
      step,
    });

    expect(result).toMatchObject({ skipped: true, reason: "brand_needs_confirmation" });

    const [audit] = await client<{ status: string; metadata: Record<string, unknown> }[]>`
      SELECT status, metadata FROM audits WHERE id = ${AUDIT_ID}
    `;
    expect(audit.status).toBe("failed");
    expect(audit.metadata.errorCode).toBe("BrandNeedsConfirmationError");

    // No citation rows -- the gate fired before any LLM call.
    const citationRows = await client`SELECT * FROM citations WHERE audit_id = ${AUDIT_ID}`;
    expect(citationRows.length).toBe(0);
  });
});
