/**
 * Playwright-run follow-ups (9 Nov), part 1 -- the one helper that gives each Playwright spec its own
 * account and workspace (tests/e2e/helpers/spec-account.ts). 98 of the 9 Nov run's 133 failures came
 * from specs that seeded one workspace and signed in to another. This proves what a spec gets: an
 * account the real better-auth config signs in, its profile, an active accepted owner membership,
 * the plan from a subscription row (never organizations.tier), a fresh start on every run, and a clean
 * removal -- in the local e2e database only.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";
import { assertE2eDatabaseUrl, e2eDatabaseUrl } from "../e2e/helpers/e2e-database";
import {
  addSpecBrand,
  createSpecAccount,
  removeSpecAccount,
  type SpecAccount,
  setSpecPlan,
} from "../e2e/helpers/spec-account";

const OWNER_KEY = "itest-spec-owner";
const VIEWER_KEY = "itest-spec-viewer";
const FREE_KEY = "itest-spec-free";

describe("it refuses anything but the local e2e database, before connecting", () => {
  const saved = process.env.DATABASE_URL;
  afterEach(() => {
    process.env.DATABASE_URL = saved;
  });

  it.each([
    ["visibleau_prod", "postgresql://user:secret@localhost:5432/visibleau_prod"],
    ["the dev database", "postgresql://user:secret@localhost:5432/visibleau"],
    ["Neon", "postgresql://user:secret@ep-example.ap-southeast-2.aws.neon.tech/visibleau_e2e"],
    ["any other host", "postgresql://user:secret@db.example.com:5432/visibleau_e2e"],
  ])("%s", async (_name, url) => {
    expect(() => assertE2eDatabaseUrl(url, "DATABASE_URL")).toThrow(/Refusing to run/);
    process.env.DATABASE_URL = url;
    expect(() => e2eDatabaseUrl()).toThrow(/Refusing to run/);
    await expect(createSpecAccount({ key: OWNER_KEY, plan: "agency" })).rejects.toThrow(
      /Refusing to run/,
    );
    await expect(removeSpecAccount(OWNER_KEY)).rejects.toThrow(/Refusing to run/);
  });

  it("no URL at all names the variable", () => {
    delete process.env.DATABASE_URL;
    expect(() => e2eDatabaseUrl()).toThrow(/DATABASE_URL is not set/);
  });
});

describe("in a test database (the integration tests' own, 13 Nov part 6; never Playwright's)", () => {
  let sql: ReturnType<typeof postgres>;
  let owner: SpecAccount;

  beforeAll(async () => {
    sql = postgres(getTestDatabaseUrl(), { max: 1 });
    owner = await createSpecAccount({ key: OWNER_KEY, plan: "agency", name: "Spec Owner" });
  }, 60_000);

  afterAll(async () => {
    await removeSpecAccount(VIEWER_KEY);
    await removeSpecAccount(FREE_KEY);
    await removeSpecAccount(OWNER_KEY);
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM auth_users WHERE id LIKE 'e2e-spec-itest-spec-%'
    `;
    expect(count).toBe(0);
    await sql.end();
  });

  it("an account, its profile, an active accepted owner membership and the plan's subscription", async () => {
    const [row] = await sql<
      {
        verified: boolean;
        credential: number;
        role: string;
        member_role: string;
        accepted: boolean;
        active: boolean;
        org_tier: string;
        sub_tier: string;
        sub_status: string;
      }[]
    >`
      SELECT au.email_verified AS verified,
        (SELECT count(*)::int FROM auth_accounts WHERE user_id = au.id AND provider_id = 'credential') AS credential,
        u.role, m.role AS member_role, m.accepted_at IS NOT NULL AS accepted, m.is_active AS active,
        o.tier AS org_tier, s.tier AS sub_tier, s.status AS sub_status
      FROM auth_users au
      JOIN users u ON u.clerk_user_id = au.id
      JOIN organizations o ON o.id = u.organization_id
      JOIN org_members m ON m.user_id = u.id AND m.organization_id = o.id
      JOIN subscriptions s ON s.organization_id = o.id
      WHERE au.id = ${owner.authUserId}
    `;
    expect(row).toEqual({
      verified: true,
      credential: 1,
      role: "owner",
      member_role: "owner",
      accepted: true,
      active: true,
      // Left at 'free' on purpose: the plan is the subscription's.
      org_tier: "free",
      sub_tier: "agency",
      sub_status: "active",
    });
    expect(owner.organizationId).toBeTruthy();
    expect(owner.email).toBe(`e2e-spec-${OWNER_KEY}@test.visibleau.dev`);
  });

  it("the real better-auth config signs it in, as the profile the app finds by id", async () => {
    const { auth } = await import("@/lib/auth/server");
    const signedIn = await auth.api.signInEmail({
      body: { email: owner.email, password: owner.password },
    });
    expect(signedIn.token).toBeTruthy();
    expect(signedIn.user.id).toBe(owner.authUserId);
  });

  it("every gate sees the subscription's plan, and setSpecPlan moves it (null is Free)", async () => {
    const { serviceDb } = await import("@/db/client");
    const { effectiveTier } = await import("@/lib/pricing/effective-tier");
    expect(await effectiveTier(serviceDb, owner.organizationId)).toBe("agency");
    await setSpecPlan(owner, "starter");
    expect(await effectiveTier(serviceDb, owner.organizationId)).toBe("starter");
    await setSpecPlan(owner, null);
    expect(await effectiveTier(serviceDb, owner.organizationId)).toBe("free");
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM subscriptions WHERE organization_id = ${owner.organizationId}
    `;
    expect(count).toBe(0);
    await setSpecPlan(owner, "agency");
    expect(await effectiveTier(serviceDb, owner.organizationId)).toBe("agency");
  });

  it("Free is no subscription row", async () => {
    const free = await createSpecAccount({ key: FREE_KEY, plan: null });
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM subscriptions WHERE organization_id = ${free.organizationId}
    `;
    expect(count).toBe(0);
  });

  it("a member joins the owner's workspace with its role, and its removal leaves the workspace", async () => {
    const viewer = await createSpecAccount({
      key: VIEWER_KEY,
      plan: null,
      memberOf: { owner, role: "viewer" },
    });
    expect(viewer.organizationId).toBe(owner.organizationId);
    const [row] = await sql<{ role: string; member_role: string; active: boolean }[]>`
      SELECT u.role, m.role AS member_role, m.is_active AS active
      FROM users u JOIN org_members m ON m.user_id = u.id
      WHERE u.clerk_user_id = ${viewer.authUserId} AND m.organization_id = ${owner.organizationId}
    `;
    expect(row).toEqual({ role: "viewer", member_role: "viewer", active: true });
    await expect(
      createSpecAccount({ key: VIEWER_KEY, plan: "agency", memberOf: { owner, role: "viewer" } }),
    ).rejects.toThrow(/its plan is the owner's/);

    await removeSpecAccount(viewer);
    const [left] = await sql<{ org: number; viewer: number }[]>`
      SELECT (SELECT count(*)::int FROM organizations WHERE id = ${owner.organizationId}) AS org,
        (SELECT count(*)::int FROM users WHERE clerk_user_id = ${viewer.authUserId}) AS viewer
    `;
    expect(left).toEqual({ org: 1, viewer: 0 });
  });

  it("making it again starts fresh: what the last run left under the key is gone", async () => {
    const brandId = await addSpecBrand(owner, { name: "Spec Co", domain: "spec.example.com.au" });
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audits (brand_id, organization_id, audit_number, triggered_by, status)
      VALUES (${brandId}, ${owner.organizationId}, 1, 'manual', 'complete') RETURNING id
    `;
    await sql`
      INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt, response_text, cited_sources, llm_model, llm_cost_usd)
      VALUES (${audit.id}, 'chatgpt', 'q', 0, 1, false, false, 'answer', ${sql.json([])}, 'test-model', '0')
    `;
    const again = await createSpecAccount({ key: OWNER_KEY, plan: "agency", name: "Spec Owner" });
    expect(again.organizationId).not.toBe(owner.organizationId);
    const [left] = await sql<{ org: number; brands: number; citations: number; users: number }[]>`
      SELECT (SELECT count(*)::int FROM organizations WHERE id = ${owner.organizationId}) AS org,
        (SELECT count(*)::int FROM brands WHERE id = ${brandId}) AS brands,
        (SELECT count(*)::int FROM citations WHERE audit_id = ${audit.id}) AS citations,
        (SELECT count(*)::int FROM users WHERE clerk_user_id = ${owner.authUserId}) AS users
    `;
    expect(left).toEqual({ org: 0, brands: 0, citations: 0, users: 1 });
    owner = again;
  });

  it("removing it takes the account, the workspace and every row in it", async () => {
    await addSpecBrand(owner, { name: "Spec Co", domain: "spec.example.com.au" });
    await removeSpecAccount(owner);
    const [left] = await sql<{ auth: number; org: number; brands: number }[]>`
      SELECT (SELECT count(*)::int FROM auth_users WHERE id = ${owner.authUserId}) AS auth,
        (SELECT count(*)::int FROM organizations WHERE id = ${owner.organizationId}) AS org,
        (SELECT count(*)::int FROM brands WHERE organization_id = ${owner.organizationId}) AS brands
    `;
    expect(left).toEqual({ auth: 0, org: 0, brands: 0 });
  });
});
