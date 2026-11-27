/**
 * S04 part 2 (migration 0157; LLD 12): the weekly retention job's audit step deletes an audit's reach results with the
 * audit (audit_reach_results cascades from audits), 12 months after it, and keeps a current audit's. A brand's reaches
 * stay with the brand (brands are closed, not deleted, by the app; a hard delete cascades: the schema test).
 * The real step runs with the clock set to 2002 (Date only), so its cutoff catches only the audit seeded in 2001.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const client = postgres(getTestDatabaseUrl(), { max: 1 });
const ORG = randomUUID();
const BRAND = randomUUID();
const OLD = randomUUID();
const NEW = randomUUID();

async function runAuditStep(now: string): Promise<void> {
  const { auditDataRetention } = await import("@/inngest/functions/audit-data-retention");
  const step = {
    run: async (name: string, work: () => Promise<unknown>) =>
      name === "delete-old-audit-data" ? work() : {},
  };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  try {
    await (
      auditDataRetention as unknown as { fn: (ctx: { step: typeof step }) => Promise<unknown> }
    ).fn({ step });
  } finally {
    vi.useRealTimers();
  }
}

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  await client`INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`reach-retention-${ORG}`}, 'Reach Retention Org', ${`reach-retention-${ORG}`})`;
  await client`INSERT INTO brands (id, organization_id, name, domain, vertical, region)
    VALUES (${BRAND}, ${ORG}, 'Reach Retention Plumbing', ${`${BRAND.slice(0, 8)}.example.com.au`}, 'tradies', 'au')`;
  await client`INSERT INTO brand_visibility_scopes (organization_id, brand_id, reach, place, target_count)
    VALUES (${ORG}, ${BRAND}, 'local', '{"suburb": "Bondi"}'::jsonb, 10)`;
  for (const [id, n, created] of [
    [OLD, 1, "2001-01-10T00:00:00Z"],
    [NEW, 2, null],
  ] as const) {
    await client`INSERT INTO audits (id, brand_id, organization_id, audit_number, status, triggered_by, created_at)
      VALUES (${id}, ${BRAND}, ${ORG}, ${n}, 'complete', 'manual', ${created ?? client`now()`})`;
    await client`INSERT INTO audit_reach_results (audit_id, organization_id, reach, everyday_answers, mentioned, reach_hash)
      VALUES (${id}, ${ORG}, 'local', 40, 6, 'h')`;
  }
}, 30_000);

afterAll(async () => {
  await client`DELETE FROM audit_reach_results WHERE organization_id = ${ORG}`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG}`;
  await client`DELETE FROM brand_visibility_scopes WHERE organization_id = ${ORG}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG}`;
  await client`DELETE FROM organizations WHERE id = ${ORG}`;
  await client.end();
});

describe("retention", () => {
  it("an audit past 12 months goes with its reach results; a current one and the brand's reaches stay", async () => {
    await runAuditStep("2002-03-01T00:00:00Z");
    const results = await client<{ audit_id: string }[]>`
      SELECT audit_id FROM audit_reach_results WHERE organization_id = ${ORG}`;
    expect(results).toEqual([{ audit_id: NEW }]);
    expect(await client`SELECT 1 FROM audits WHERE id = ${OLD}`).toHaveLength(0);
    expect(
      await client`SELECT 1 FROM brand_visibility_scopes WHERE brand_id = ${BRAND}`,
    ).toHaveLength(1);
  });
});
