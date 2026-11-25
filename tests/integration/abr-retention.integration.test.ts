/**
 * S01B part 5 (LLD amendment 54, Sri's decision of 25 Nov 2026): "ABR results are deleted 12 months after each check,
 * like audit results: the weekly retention job deletes brand_entity_scores rows older than 12 months and clears
 * brands.abn_suggestion once its check is older than 12 months; deleting a brand clears its abn_suggestion at once.
 * (brands.abn is the customer's own entry and stays with the brand.)"
 *
 * The real step of the weekly job ("delete-old-audit-data", inngest/functions/audit-data-retention.ts) runs with the
 * clock set to 2002 (Date only), so its 12-month cutoff catches only what is seeded here in 2001 and nothing else in
 * the shared test database. RED on the parent: the job kept every ABR result, and brand deletion kept the suggestion.
 * The businesses and ABNs are invented (amendment 57; each ABN fails the ATO checksum).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG = randomUUID();
const USER = randomUUID();
const BRAND = {
  checks: randomUUID(),
  oldFound: randomUUID(),
  oldNone: randomUUID(),
  newFound: randomUUID(),
  malformed: randomUUID(),
  deleted: randomUUID(),
};

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: USER,
    organizationId: ORG,
    email: "owner@abr-retention.example.com.au",
    name: "Owner",
    role: "owner",
    organization: { id: ORG, name: "Wattle Retention Agency", region: "au", metadata: {} },
  })),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });

/** A found suggestion as app/api/brands/[brandId]/abn-suggestion/route.ts stores it. */
function found(abn: string, checkedAt: string, answer?: "confirmed" | "dismissed") {
  return {
    status: "found",
    suggestion: {
      abn,
      entity: "WATTLE GROVE PLUMBING PTY LTD",
      businessName: "Wattle Grove Plumbing",
      postcode: "2170",
      state: "NSW",
      abnStatus: "Active",
      checkedAt,
    },
    ...(answer ? { answer, answeredAt: checkedAt } : {}),
  };
}

async function brand(id: string, name: string, abn: string | null, suggestion: unknown) {
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, abn, abn_suggestion)
    VALUES (${id}, ${ORG}, ${name}, ${`${id.slice(0, 8)}.wattle-grove.test`}, 'tradies', 'au', ${abn},
      ${suggestion === null ? null : sql.json(suggestion as postgres.JSONValue)})`;
}

async function entityCheck(brandId: string, checkedAt: string) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO brand_entity_scores (brand_id, organization_id, abn_verified, abn_number, abn_entity_name, abn_status, checked_at)
    VALUES (${brandId}, ${ORG}, true, '51824753557', 'WATTLE GROVE PLUMBING PTY LTD', 'Active', ${checkedAt}::timestamptz)
    RETURNING id`;
  return row.id;
}

const entityExists = async (id: string) =>
  (await sql`SELECT 1 FROM brand_entity_scores WHERE id = ${id}`).length === 1;

async function brandRow(id: string) {
  const [row] = await sql<
    { abn: string | null; abn_suggestion: unknown; deleted_at: Date | null }[]
  >`SELECT abn, abn_suggestion, deleted_at FROM brands WHERE id = ${id}`;
  return row;
}

/** Runs only the retention job's audit step, with the clock at `now`; returns the step's result. */
async function runAuditStep(now: string): Promise<Record<string, unknown>> {
  const { auditDataRetention } = await import("@/inngest/functions/audit-data-retention");
  let result: Record<string, unknown> = {};
  const step = {
    run: async (name: string, work: () => Promise<unknown>) => {
      if (name !== "delete-old-audit-data") return {};
      result = (await work()) as Record<string, unknown>;
      return result;
    },
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
  return result;
}

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`abr-retention-${ORG}`}, 'Wattle Retention Agency', ${`abr-retention-${ORG}`})`;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER}, ${`abr-${USER}`}, ${ORG}, ${`owner-${USER.slice(0, 8)}@abr-retention.example.com.au`}, 'Owner', 'owner')`;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG}, ${USER}, 'owner', now(), now(), true)`;

  await brand(BRAND.checks, "Wattle Grove Plumbing", "51824753557", null);
  // Searched in 2001 and confirmed: the suggestion goes, the ABN it filled in (the business's own entry) stays.
  await brand(
    BRAND.oldFound,
    "Wattle Grove Electrical",
    "33628104975",
    found("33628104975", "2001-02-01T00:00:00.000Z", "confirmed"),
  );
  await brand(BRAND.oldNone, "Wattle Grove Roofing", null, {
    status: "none",
    checkedAt: "2001-04-01T00:00:00.000Z",
  });
  await brand(
    BRAND.newFound,
    "Wattle Grove Fencing",
    null,
    found("86103551072", "2026-11-20T00:00:00.000Z"),
  );
  await brand(BRAND.malformed, "Wattle Grove Glazing", null, {
    status: "none",
    checkedAt: "last year",
  });
  await brand(
    BRAND.deleted,
    "Wattle Grove Painting",
    "51824753557",
    found("51824753557", "2026-11-20T00:00:00.000Z", "confirmed"),
  );
}, 60_000);

afterAll(async () => {
  const ids = Object.values(BRAND);
  await sql`DELETE FROM brand_entity_scores WHERE brand_id = ANY(${ids})`;
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brands WHERE id = ANY(${ids})`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM users WHERE id = ${USER}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql.end();
});

describe("ABR results are deleted 12 months after each check, as audit results are (amendment 54)", () => {
  it("the weekly job deletes an entity check older than 12 months and keeps a newer one, and counts them", async () => {
    const old = await entityCheck(BRAND.checks, "2001-03-01T00:00:00Z");
    const current = await entityCheck(BRAND.checks, "2026-11-20T00:00:00Z");

    // The clock in mid-2002: the 12-month cutoff is 1 June 2001.
    const result = await runAuditStep("2002-06-01T00:00:00Z");
    expect(result.deletedEntityScores).toBeGreaterThanOrEqual(1);
    expect(result.more).toBe(false);
    expect(await entityExists(old)).toBe(false);
    expect(await entityExists(current)).toBe(true);
  });

  it("clears an ABN suggestion whose search is older than 12 months, keeps a newer one, and keeps the business's own ABN", async () => {
    // The first test's run may have cleared them already; the next test checks the count.
    const result = await runAuditStep("2002-06-01T00:00:00Z");
    expect(result.more).toBe(false);

    expect(await brandRow(BRAND.oldFound)).toMatchObject({
      abn: "33628104975",
      abn_suggestion: null,
    });
    expect((await brandRow(BRAND.oldNone)).abn_suggestion).toBeNull();
    expect((await brandRow(BRAND.newFound)).abn_suggestion).toEqual(
      found("86103551072", "2026-11-20T00:00:00.000Z"),
    );
    // A value with no date it can read is kept, and the run doesn't fail on it.
    expect((await brandRow(BRAND.malformed)).abn_suggestion).toEqual({
      status: "none",
      checkedAt: "last year",
    });
  });

  it("counts the suggestions it clears", async () => {
    await sql`
      UPDATE brands SET abn_suggestion = ${sql.json({ status: "failed", checkedAt: "2001-05-01T00:00:00.000Z" })}
      WHERE id = ${BRAND.oldNone}`;
    const result = await runAuditStep("2002-06-01T00:00:00Z");
    expect(result.clearedAbnSuggestions).toBeGreaterThanOrEqual(1);
    expect((await brandRow(BRAND.oldNone)).abn_suggestion).toBeNull();
  });

  it("deleting a brand clears its ABN suggestion at once and keeps its ABN; its entity checks go with the job", async () => {
    const check = await entityCheck(BRAND.deleted, "2026-11-20T00:00:00Z");
    const { DELETE } = await import("@/app/api/brands/[brandId]/route");
    const res = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), {
      params: Promise.resolve({ brandId: BRAND.deleted }),
    });
    expect(res.status).toBe(204);

    const row = await brandRow(BRAND.deleted);
    expect(row.deleted_at).not.toBeNull();
    expect(row.abn_suggestion).toBeNull();
    expect(row.abn).toBe("51824753557");
    // Brand deletion is a soft delete: the entity check stays until it is 12 months old.
    expect(await entityExists(check)).toBe(true);
  });
});
