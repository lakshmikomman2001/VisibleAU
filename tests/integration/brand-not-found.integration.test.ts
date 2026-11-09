/**
 * Regression follow-ups (9 Nov), part 5 -- another workspace's brand answers 404, like a brand that doesn't
 * exist, on the real routes: the documented policy (docs/ops/post-launch-db-hardening.md, "the 403-vs-404
 * policy"): never confirm another workspace's brand exists; 403 only for a same-workspace brand a member's
 * role doesn't extend to. 51 routes still answered 403 for both (the policy's helper was adopted in 9 and the
 * rest left "not yet updated"), the brand's own GET/PATCH/DELETE among them. And deleting a brand is a soft
 * delete, after which it isn't there.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { currentUserMock } = vi.hoisted(() => ({ currentUserMock: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: currentUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const RUN = randomUUID().slice(0, 8);
const OURS = {
  org: randomUUID(),
  owner: randomUUID(),
  analyst: randomUUID(),
  brand: randomUUID(),
  other: randomUUID(),
  doomed: randomUUID(),
};
const THEIRS = { org: randomUUID(), owner: randomUUID(), brand: randomUUID() };
const MISSING = randomUUID();

let sql: ReturnType<typeof postgres>;

function as(userId: string, orgId: string, role: string) {
  currentUserMock.mockResolvedValue({
    id: userId,
    organizationId: orgId,
    email: `${role}-${userId.slice(0, 8)}@not-found.example.com.au`,
    name: role,
    role,
    organization: { id: orgId, name: "Not-found Org" },
  });
}

const brandRoute = () => import("@/app/api/brands/[brandId]/route");
const params = (brandId: string) => ({ params: Promise.resolve({ brandId }) });

async function get(brandId: string) {
  const { GET } = await brandRoute();
  return GET(new Request(`http://localhost:3000/api/brands/${brandId}`), params(brandId));
}
async function patch(brandId: string, body: unknown) {
  const { PATCH } = await brandRoute();
  return PATCH(
    new Request(`http://localhost:3000/api/brands/${brandId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    params(brandId),
  );
}
async function del(brandId: string) {
  const { DELETE } = await brandRoute();
  return DELETE(
    new Request(`http://localhost:3000/api/brands/${brandId}`, { method: "DELETE" }),
    params(brandId),
  );
}
async function bodyOf(res: Response) {
  return { status: res.status, body: await res.json() };
}

async function seedOrg(org: string, label: string) {
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier)
    VALUES (${org}, ${`not-found-${label}-${RUN}`}, ${`Not-found ${label}`}, ${`not-found-${label}-${RUN}`}, 'agency_pro')
  `;
  // The plan comes from the subscription (lib/pricing/effective-tier.ts), so a plan-gated route reaches its
  // brand check rather than refusing on the plan.
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${org}, ${`cus_${org}`}, ${`sub_${org}`}, 'price_test', 'agency_pro', 'monthly', 'active')
  `;
}
async function seedUser(
  id: string,
  org: string,
  role: string,
  brandAccess: string[] | null = null,
) {
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${id}, ${`not-found-${id}`}, ${org}, ${`${role}-${id.slice(0, 8)}@not-found.example.com.au`}, ${role}, ${role})
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, brand_access, expires_at, accepted_at, is_active)
    VALUES (${org}, ${id}, ${role}, ${brandAccess === null ? null : sql.json(brandAccess)}, now(), now(), true)
  `;
}
async function seedBrand(id: string, org: string, label: string) {
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${id}, ${org}, ${`Not-found ${label} Co`}, ${`${label}-${RUN}.not-found.example.com.au`}, 'tradies', 'au', ARRAY[]::text[])
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await seedOrg(OURS.org, "ours");
  await seedOrg(THEIRS.org, "theirs");
  await seedUser(OURS.owner, OURS.org, "owner");
  // An analyst whose role extends to one of the workspace's brands only.
  await seedUser(OURS.analyst, OURS.org, "analyst", [OURS.other]);
  await seedUser(THEIRS.owner, THEIRS.org, "owner");
  await seedBrand(OURS.brand, OURS.org, "ours");
  await seedBrand(OURS.other, OURS.org, "other");
  await seedBrand(OURS.doomed, OURS.org, "doomed");
  await seedBrand(THEIRS.brand, THEIRS.org, "theirs");
  // The routes' first import transforms their whole module graph.
  await brandRoute();
}, 60_000);

afterAll(async () => {
  for (const org of [OURS.org, THEIRS.org]) {
    await sql`DELETE FROM audit_schedules WHERE organization_id = ${org}`;
    await sql`DELETE FROM report_delivery_schedules WHERE organization_id = ${org}`;
    await sql`DELETE FROM brands WHERE organization_id = ${org}`;
    await sql`DELETE FROM org_members WHERE organization_id = ${org}`;
    await sql`DELETE FROM users WHERE organization_id = ${org}`;
    await sql`DELETE FROM subscriptions WHERE organization_id = ${org}`;
    await sql`DELETE FROM organizations WHERE id = ${org}`;
  }
  await sql.end();
});

describe("another workspace's brand, on the brand's own route", () => {
  it("GET, PATCH and DELETE answer 404 Not found, the same as a brand that doesn't exist", async () => {
    as(OURS.owner, OURS.org, "owner");
    const notFound = { status: 404, body: { error: "Not found" } };
    expect(await bodyOf(await get(THEIRS.brand))).toEqual(notFound);
    expect(await bodyOf(await patch(THEIRS.brand, { name: "Taken over" }))).toEqual(notFound);
    expect(await bodyOf(await del(THEIRS.brand))).toEqual(notFound);
    expect(await bodyOf(await get(MISSING))).toEqual(notFound);
    expect(await bodyOf(await patch(MISSING, { name: "Taken over" }))).toEqual(notFound);
    expect(await bodyOf(await del(MISSING))).toEqual(notFound);
  });

  it("is left exactly as it was", async () => {
    const [brand] = await sql<{ name: string; deleted_at: Date | null }[]>`
      SELECT name, deleted_at FROM brands WHERE id = ${THEIRS.brand}
    `;
    expect(brand).toEqual({ name: "Not-found theirs Co", deleted_at: null });
  });

  it("its own workspace still reads it", async () => {
    as(THEIRS.owner, THEIRS.org, "owner");
    const res = await get(THEIRS.brand);
    expect(res.status).toBe(200);
    expect((await res.json()).brand.id).toBe(THEIRS.brand);
  });
});

describe("a brand in the member's own workspace their role doesn't extend to", () => {
  it("answers 403 Brand access denied (its existence isn't in question), and the brand they have answers 200", async () => {
    as(OURS.analyst, OURS.org, "analyst");
    expect(await bodyOf(await get(OURS.brand))).toEqual({
      status: 403,
      body: { error: "Brand access denied" },
    });
    expect((await get(OURS.other)).status).toBe(200);
  });
});

describe("deleting a brand", () => {
  it("is a soft delete: 204, the row kept with deleted_at set", async () => {
    as(OURS.owner, OURS.org, "owner");
    const res = await del(OURS.doomed);
    expect(res.status).toBe(204);
    const [row] = await sql<
      { deleted_at: Date | null }[]
    >`SELECT deleted_at FROM brands WHERE id = ${OURS.doomed}`;
    expect(row.deleted_at).not.toBeNull();
  });

  it("after which the brand isn't there: GET, PATCH and DELETE answer 404", async () => {
    as(OURS.owner, OURS.org, "owner");
    expect((await get(OURS.doomed)).status).toBe(404);
    expect((await patch(OURS.doomed, { name: "Back again" })).status).toBe(404);
    expect((await del(OURS.doomed)).status).toBe(404);
    expect((await get(OURS.brand)).status).toBe(200);
  });
});

describe("the same answer from the brand's other routes", () => {
  it.each([
    ["visibility", () => import("@/app/api/brands/[brandId]/visibility/route")],
    ["metrics", () => import("@/app/api/brands/[brandId]/metrics/route")],
    ["reports", () => import("@/app/api/brands/[brandId]/reports/route")],
    ["tasks", () => import("@/app/api/brands/[brandId]/tasks/route")],
  ] as const)(
    "GET %s: 404 for another workspace's brand",
    async (_name, load) => {
      as(OURS.owner, OURS.org, "owner");
      const { GET } = (await load()) as {
        GET: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
      };
      const res = await GET(
        new Request(`http://localhost:3000/api/brands/${THEIRS.brand}/x`),
        params(THEIRS.brand),
      );
      expect(res.status).toBe(404);
    },
    60_000,
  );
});
