/**
 * S01B part 2 (LLD amendment 49): an Enhanced report's refresh re-runs the brand's technical audit with no audit, so
 * technical_audits gains rows whose audit_id is null. A refresh row is a legitimate latest technical check for the
 * brand and never claims to belong to an audit.
 * - Readers (the Health Check route, the raw technical-audit route) take it as the brand's latest check, by date,
 *   with audit_id null -- they never used audit_id, so they needed no change (these hold on the parent too).
 * - The weekly retention job deleted technical_audits only through the audits row's cascade, so a refresh row was
 *   never deleted: it now goes on the same cutoff (RED on the parent).
 * - Brand deletion is a soft delete (brands.deleted_at) that removes no technical_audits row of either kind; a deleted
 *   brand's refresh row is then removed by the retention job exactly when its audit-linked rows are.
 * The reader table is in docs/Sprints/reports/S01B-report.md (Part 2).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const USER = randomUUID();
const who = vi.hoisted(() => ({ orgId: "", userId: "" }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: who.userId,
    organizationId: who.orgId,
    email: "owner@refresh-rows.example.com.au",
    name: "Owner",
    role: "owner",
    organization: { id: who.orgId, name: "Possum Marketing", region: "au", metadata: {} },
  })),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let fx: ReportFixture;
const ROBOTS = { fetchStatus: "ok", aiBotsAllowed: ["OAI-SearchBot"], aiBotsBlocked: [] };

async function technicalRow(input: { auditId: string | null; score: string; createdAt: string }) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO technical_audits (brand_id, organization_id, audit_id, score_composite, findings, created_at, crawled_at)
    VALUES (${fx.brandId}, ${fx.orgId}, ${input.auditId}, ${input.score}, ${sql.json({ robots: ROBOTS })},
      ${input.createdAt}::timestamptz, ${input.createdAt}::timestamptz)
    RETURNING id`;
  return row.id;
}

const exists = async (id: string) =>
  (await sql`SELECT 1 FROM technical_audits WHERE id = ${id}`).length === 1;

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  fx = await seedReportFixture(sql, {
    brandName: "Banksia Roofing",
    agencyName: "Possum Marketing",
    tier: "agency",
    audits: [{ number: 61, completedAt: "2026-11-20T03:00:00.000Z", mentions: {} }],
  });
  who.orgId = fx.orgId;
  who.userId = USER;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER}, ${`rr-${USER}`}, ${fx.orgId}, ${`owner-${USER.slice(0, 8)}@refresh-rows.example.com.au`}, 'Owner', 'owner')`;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${fx.orgId}, ${USER}, 'owner', now(), now(), true)`;
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM technical_audits WHERE organization_id = ${fx.orgId}`;
  for (const table of ["action_items", "audit_schedules", "org_members"])
    await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM users WHERE id = ${USER}`;
  await fx.cleanup();
  await sql.end();
});

describe("technical audits with no audit (an Enhanced report's refresh)", () => {
  it("the Health Check and the raw route read a refresh row as the brand's latest check, with no audit", async () => {
    const linked = await technicalRow({
      auditId: fx.audits[61],
      score: "38.00",
      createdAt: "2026-11-20T03:05:00.000Z",
    });
    const refresh = await technicalRow({
      auditId: null,
      score: "41.00",
      createdAt: "2026-11-23T01:00:00.000Z",
    });

    const { GET: readiness } = await import("@/app/api/brands/[brandId]/site-readiness/route");
    const res = await readiness(new Request("http://localhost/x"), {
      params: Promise.resolve({ brandId: fx.brandId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { scoreComposite: string; checkedAt: string };
    expect(Number(body.scoreComposite)).toBe(41);
    expect(new Date(body.checkedAt).toISOString()).toBe("2026-11-23T01:00:00.000Z");

    const { GET: raw } = await import("@/app/api/technical-audits/[id]/route");
    const rawRes = await raw(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: refresh }),
    });
    const row = (await rawRes.json()) as {
      auditId: string | null;
      scoring: { compositeMax: number };
    };
    expect(row.auditId).toBeNull();
    expect(row.scoring.compositeMax).toBeGreaterThan(0);

    await sql`DELETE FROM technical_audits WHERE id IN (${linked}, ${refresh})`;
  });

  it("the retention job deletes a refresh row past the cutoff, as an old audit's own row goes with its audit", async () => {
    const { db } = await import("@/db/client");
    const { deleteExpiredAudits } = await import("@/lib/retention/audit-retention");
    const oldRefresh = await technicalRow({
      auditId: null,
      score: "30.00",
      createdAt: "2001-03-01T00:00:00Z",
    });
    const newRefresh = await technicalRow({
      auditId: null,
      score: "41.00",
      createdAt: "2026-11-23T01:00:00Z",
    });
    const current = await technicalRow({
      auditId: fx.audits[61],
      score: "38.00",
      createdAt: "2026-11-20T03:05:00Z",
    });

    // The cutoff of a run in 2002 (12 months): only rows from 2001 are past it.
    const result = await deleteExpiredAudits(db, new Date("2002-01-01T00:00:00Z"));
    expect(result.deletedUnlinkedTechnicalAudits).toBeGreaterThanOrEqual(1);
    expect(result.more).toBe(false);
    expect(await exists(oldRefresh)).toBe(false);
    expect(await exists(newRefresh)).toBe(true);
    expect(await exists(current)).toBe(true);
    await sql`DELETE FROM technical_audits WHERE id IN (${newRefresh}, ${current})`;
  });

  it("brand deletion keeps both kinds alike (a soft delete), and the retention job then removes both together", async () => {
    // Both made in 2001, as the brand's last audit was.
    await sql`UPDATE audits SET created_at = '2001-02-01T00:00:00Z' WHERE id = ${fx.audits[61]}`;
    const linked = await technicalRow({
      auditId: fx.audits[61],
      score: "38.00",
      createdAt: "2001-02-01T00:05:00Z",
    });
    const refresh = await technicalRow({
      auditId: null,
      score: "41.00",
      createdAt: "2001-02-03T00:00:00Z",
    });

    const { DELETE } = await import("@/app/api/brands/[brandId]/route");
    const res = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), {
      params: Promise.resolve({ brandId: fx.brandId }),
    });
    expect(res.status).toBe(204);
    // Nothing of either kind is removed when the brand is deleted (brands.deleted_at only) ...
    expect([await exists(linked), await exists(refresh)]).toEqual([true, true]);

    // ... and both go when their time is up: the audit's row with its audit, the refresh row on its own.
    const { db } = await import("@/db/client");
    const { deleteExpiredAudits } = await import("@/lib/retention/audit-retention");
    await deleteExpiredAudits(db, new Date("2002-01-01T00:00:00Z"));
    expect([await exists(linked), await exists(refresh)]).toEqual([false, false]);
  });
});
