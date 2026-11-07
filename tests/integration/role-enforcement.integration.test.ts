/**
 * Team follow-ups (31 Oct), item 6 -- roles are enforced on the server, not just by the buttons. On
 * production an Analyst saw "+ New brand", and most routes that change a workspace's data checked no role.
 * For each role, one change it may make and one it may not, through the real routes against the test
 * database: the forbidden one answers 403, saying who may, and changes nothing. Only the signed-in user is
 * stubbed; each profile's role on users is "member", so the membership's role is the one that counts.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OrgRole } from "@/lib/governance/permissions";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { currentUserMock, sendMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  sendMock: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: currentUserMock }));
// Nothing in these tests may start background work; an attempt would show here.
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: sendMock } }));
// revalidatePath needs a request; there is none here.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const DOOMED_BRAND_ID = randomUUID();
const PEOPLE: Record<OrgRole, string> = {
  owner: randomUUID(),
  admin: randomUUID(),
  analyst: randomUUID(),
  viewer: randomUUID(),
};
const BASE = "http://localhost:3000";

let sql: ReturnType<typeof postgres>;

function signInAs(role: OrgRole) {
  currentUserMock.mockResolvedValue({
    id: PEOPLE[role],
    organizationId: ORG_ID,
    email: `${role}@role-enforcement.example.com.au`,
    name: role,
    role: "member",
    organization: { id: ORG_ID, name: "Role Enforcement Org" },
  });
}

type Handler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

/** Each route's module, by a literal path (so the alias resolves). */
const ROUTES: Record<string, () => Promise<Record<string, unknown>>> = {
  audits: () => import("@/app/api/audits/route"),
  "brands/[brandId]/health-check-banner": () =>
    import("@/app/api/brands/[brandId]/health-check-banner/route"),
  "brands/[brandId]/tasks": () => import("@/app/api/brands/[brandId]/tasks/route"),
  brands: () => import("@/app/api/brands/route"),
  "brands/[brandId]": () => import("@/app/api/brands/[brandId]/route"),
  "billing/portal": () => import("@/app/api/billing/portal/route"),
};

async function call(
  route: string,
  handler: string,
  method: string,
  params: Record<string, string>,
  body?: unknown,
) {
  const mod = await ROUTES[route]();
  const res = await (mod[handler] as Handler)(
    new Request(`${BASE}/api/${route}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve(params) },
  );
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

const brandCount = async () => {
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM brands WHERE organization_id = ${ORG_ID} AND deleted_at IS NULL
  `;
  return n;
};

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`role-enf-${ORG_ID}`}, 'Role Enforcement Org', ${`role-enf-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'agency_pro', 'monthly', 'active')
  `;
  for (const [id, name] of [
    [BRAND_ID, "Role Co"],
    [DOOMED_BRAND_ID, "Doomed Co"],
  ]) {
    await sql`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
      VALUES (${id}, ${ORG_ID}, ${name}, ${`${id.slice(0, 8)}.example.com.au`}, 'tradies', 'au', ARRAY[]::text[])
    `;
  }
  for (const [role, id] of Object.entries(PEOPLE)) {
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`role-enf-${id}`}, ${ORG_ID}, ${`${role}@role-enforcement.example.com.au`}, ${role}, 'member')
    `;
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${ORG_ID}, ${id}, ${role}, now(), now(), true)
    `;
  }
}, 60000);

afterAll(async () => {
  await sql`DELETE FROM remediation_tasks WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

describe("a viewer: read-only", () => {
  it("can't run an audit: 403, saying who can, and no audit is made", async () => {
    signInAs("viewer");
    const { status, body } = await call("audits", "POST", "POST", {}, { brandId: BRAND_ID });
    expect(status).toBe(403);
    expect(body.error).toBe("Only an owner, admin or analyst can run audits.");
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM audits WHERE organization_id = ${ORG_ID}
    `;
    expect(n).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("can still dismiss a notice for itself", async () => {
    signInAs("viewer");
    const { status } = await call("brands/[brandId]/health-check-banner", "DELETE", "DELETE", {
      brandId: BRAND_ID,
    });
    expect(status).toBe(200);
  });
});

describe("an analyst: runs audits and works on tasks, doesn't manage brands", () => {
  it("can add a task", async () => {
    signInAs("analyst");
    const { status } = await call(
      "brands/[brandId]/tasks",
      "POST",
      "POST",
      { brandId: BRAND_ID },
      { title: "Fix the Google Business Profile hours" },
    );
    expect(status).toBe(201);
  });

  it("can't add a brand: 403, and no brand is made (it saw '+ New brand' on production)", async () => {
    signInAs("analyst");
    const before = await brandCount();
    const { status, body } = await call(
      "brands",
      "POST",
      "POST",
      {},
      {
        name: "Analyst Co",
        domain: "analyst-co.example.com.au",
        vertical: "tradies",
        region: "au",
      },
    );
    expect(status).toBe(403);
    expect(body.error).toBe("Only an owner or admin can add a brand or change its settings.");
    expect(await brandCount()).toBe(before);
  });
});

describe("an admin: manages brands and the team, not billing", () => {
  it("can rename a brand", async () => {
    signInAs("admin");
    const { status } = await call(
      "brands/[brandId]",
      "PATCH",
      "PATCH",
      { brandId: BRAND_ID },
      { name: "Role Co Renamed" },
    );
    expect(status).toBe(200);
    const [brand] = await sql<{ name: string }[]>`SELECT name FROM brands WHERE id = ${BRAND_ID}`;
    expect(brand.name).toBe("Role Co Renamed");
  });

  it("can't open the billing portal: 403, before anything reaches Stripe", async () => {
    signInAs("admin");
    const { status, body } = await call("billing/portal", "POST", "POST", {});
    expect(status).toBe(403);
    expect(body.error).toBe("Only the owner can manage billing.");
  });

  it("can't delete a brand: owner only", async () => {
    signInAs("admin");
    const { status } = await call("brands/[brandId]", "DELETE", "DELETE", {
      brandId: DOOMED_BRAND_ID,
    });
    expect(status).toBe(403);
    const [brand] = await sql<{ deleted_at: Date | null }[]>`
      SELECT deleted_at FROM brands WHERE id = ${DOOMED_BRAND_ID}
    `;
    expect(brand.deleted_at).toBeNull();
  });
});

describe("an owner: everything", () => {
  it("can delete a brand", async () => {
    signInAs("owner");
    const { status } = await call("brands/[brandId]", "DELETE", "DELETE", {
      brandId: DOOMED_BRAND_ID,
    });
    expect(status).toBe(204);
    const [brand] = await sql<{ deleted_at: Date | null }[]>`
      SELECT deleted_at FROM brands WHERE id = ${DOOMED_BRAND_ID}
    `;
    expect(brand.deleted_at).not.toBeNull();
  });

  it("is refused nothing: every action in the matrix includes it", async () => {
    const { canPerformAction } = await import("@/lib/governance/permissions");
    const actions = [
      "run_audit",
      "generate_reports",
      "manage_brands",
      "delete_brand",
      "manage_billing",
      "manage_schedules",
      "manage_integrations",
      "generate_content",
      "edit_brand_data",
      "manage_branding",
      "invite_members",
      "assign_owner_role",
    ] as const;
    expect(actions.filter((a) => !canPerformAction("owner", a))).toEqual([]);
  });
});
