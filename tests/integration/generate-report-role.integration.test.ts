/**
 * Team follow-ups (31 Oct), item 10 -- "Generate report" had no role check, so a viewer could start one (the
 * narrative and a PDF, in storage: a document for a client). It now reads the generate_reports permission,
 * as Try again (retry-pdf) already did: owner, admin and analyst allowed, viewer 403 with nothing sent.
 * The real route against the test database; only the signed-in user and Inngest's send are stubbed.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { currentUserMock, sendMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  sendMock: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: currentUserMock }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: sendMock } }));

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const PEOPLE = {
  viewer: randomUUID(),
  analyst: randomUUID(),
  admin: randomUUID(),
} as const;

let sql: ReturnType<typeof postgres>;

async function generate(as: keyof typeof PEOPLE) {
  currentUserMock.mockResolvedValue({
    id: PEOPLE[as],
    organizationId: ORG_ID,
    email: `${as}@generate-role.example.com.au`,
    name: as,
    role: "member",
    organization: { id: ORG_ID, name: "Generate Role Org" },
  });
  const { POST } = await import("@/app/api/brands/[brandId]/reports/generate/route");
  const res = await POST(
    new Request(`http://localhost:3000/api/brands/${BRAND_ID}/reports/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ periodType: "weekly", periodLabel: "2026-W45" }),
    }),
    { params: Promise.resolve({ brandId: BRAND_ID }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`generate-role-${ORG_ID}`}, 'Generate Role Org', ${`generate-role-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'agency', 'monthly', 'active')
  `;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Role Co', 'role.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  for (const [role, id] of Object.entries(PEOPLE)) {
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`generate-role-${id}`}, ${ORG_ID}, ${`${role}@generate-role.example.com.au`}, ${role}, 'member')
    `;
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${ORG_ID}, ${id}, ${role}, now(), now(), true)
    `;
  }
}, 60000);

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ ids: ["evt_1"] });
});

afterAll(async () => {
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

describe("POST /api/brands/[brandId]/reports/generate, by role", () => {
  it("a viewer gets 403, saying who can, and no report is started", async () => {
    const { status, body } = await generate("viewer");
    expect(status).toBe(403);
    expect(body.error).toBe("Only an owner, admin or analyst can generate reports.");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it.each(["analyst", "admin"] as const)("an %s gets 202 and the report is started", async (as) => {
    const { status, body } = await generate(as);
    expect(status).toBe(202);
    expect(body).toMatchObject({ message: "Report generation started", periodLabel: "2026-W45" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toMatchObject({
      name: "trend/aggregated",
      data: { brandId: BRAND_ID, organizationId: ORG_ID, manual: true },
    });
  });
});
