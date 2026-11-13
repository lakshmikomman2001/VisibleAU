/**
 * 3 Nov -- the Agency-plan test user the Report branding specs sign in as
 * (tests/e2e/helpers/agency-user.ts): it goes only in the local e2e database,
 * running it twice changes nothing, the real better-auth config signs it in, and
 * the real gates see an Agency plan.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";
import {
  assertE2eDatabaseUrl,
  E2E_AGENCY_USER,
  ensureE2eAgencyUser,
  removeE2eAgencyUser,
} from "../e2e/helpers/agency-user";

const LOCAL_E2E = "postgresql://user:secret@localhost:5432/visibleau_e2e";

describe("it refuses anything but the local e2e database, before connecting", () => {
  it.each([
    ["visibleau_prod, named or not", "postgresql://user:secret@localhost:5432/visibleau_prod"],
    ["the dev database", "postgresql://user:secret@localhost:5432/visibleau"],
    ["any other local database", "postgresql://user:secret@127.0.0.1:5432/scratch"],
    ["Neon", "postgresql://user:secret@ep-example.ap-southeast-2.aws.neon.tech/visibleau_e2e"],
    ["any other host", "postgresql://user:secret@db.example.com:5432/visibleau_e2e"],
    ["a URL that isn't one", "not a url"],
  ])("%s", (_name, url) => {
    expect(() => assertE2eDatabaseUrl(url)).toThrow(/Refusing to run/);
  });

  it("no URL at all", () => {
    expect(() => assertE2eDatabaseUrl(undefined)).toThrow(/TEST_DATABASE_URL is not set/);
    expect(() => assertE2eDatabaseUrl("")).toThrow(/TEST_DATABASE_URL is not set/);
  });

  it("accepts the local e2e database", () => {
    expect(assertE2eDatabaseUrl(LOCAL_E2E)).toBe(LOCAL_E2E);
  });

  it("seeding and removing both refuse production's name without touching it", async () => {
    const prod = "postgresql://user:secret@localhost:5432/visibleau_prod";
    await expect(ensureE2eAgencyUser(prod)).rejects.toThrow(/Refusing to run/);
    await expect(removeE2eAgencyUser(prod)).rejects.toThrow(/Refusing to run/);
  });
});

describe("in a test database (the integration tests' own, 13 Nov part 6; never Playwright's)", () => {
  let sql: ReturnType<typeof postgres>;
  let seeded: Awaited<ReturnType<typeof ensureE2eAgencyUser>>;

  beforeAll(async () => {
    sql = postgres(getTestDatabaseUrl(), { max: 1 });
    await removeE2eAgencyUser();
    seeded = await ensureE2eAgencyUser();
  }, 60_000);

  afterAll(async () => {
    await removeE2eAgencyUser();
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM auth_users WHERE email = ${E2E_AGENCY_USER.email}
    `;
    expect(count).toBe(0);
    await sql.end();
  });

  it("running it again gives the same user, with one of everything", async () => {
    const again = await ensureE2eAgencyUser();
    expect(again).toEqual(seeded);
    const [counts] = await sql<
      { accounts: number; users: number; members: number; subscriptions: number; brands: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM auth_accounts WHERE user_id = ${seeded.authUserId}) AS accounts,
        (SELECT count(*)::int FROM users WHERE clerk_user_id = ${seeded.authUserId}) AS users,
        (SELECT count(*)::int FROM org_members WHERE organization_id = ${seeded.organizationId}) AS members,
        (SELECT count(*)::int FROM subscriptions WHERE organization_id = ${seeded.organizationId}) AS subscriptions,
        (SELECT count(*)::int FROM brands WHERE organization_id = ${seeded.organizationId}) AS brands
    `;
    expect(counts).toEqual({ accounts: 1, users: 1, members: 1, subscriptions: 1, brands: 1 });
  });

  it("the real better-auth config signs it in, as the profile the app finds by id", async () => {
    const { auth } = await import("@/lib/auth/server");
    const signedIn = await auth.api.signInEmail({
      body: { email: E2E_AGENCY_USER.email, password: E2E_AGENCY_USER.password },
    });
    expect(signedIn.token).toBeTruthy();
    expect(signedIn.user.id).toBe(seeded.authUserId);
    const [profile] = await sql<{ organization_id: string; role: string }[]>`
      SELECT organization_id, role FROM users WHERE clerk_user_id = ${signedIn.user.id}
    `;
    expect(profile).toEqual({ organization_id: seeded.organizationId, role: "owner" });
  });

  it("the wrong password doesn't", async () => {
    const { auth } = await import("@/lib/auth/server");
    await expect(
      auth.api.signInEmail({ body: { email: E2E_AGENCY_USER.email, password: "wrong-password" } }),
    ).rejects.toThrow();
  });

  it("every gate sees an Agency plan, so Report branding opens", async () => {
    const { serviceDb } = await import("@/db/client");
    const { effectiveTier } = await import("@/lib/pricing/effective-tier");
    const { orgHasReportBranding } = await import("@/lib/branding/agency-assets");
    expect(await effectiveTier(serviceDb, seeded.organizationId)).toBe("agency");
    expect(await orgHasReportBranding(serviceDb, seeded.organizationId)).toBe(true);
  });

  it("it has a brand, so /dashboard doesn't send it to the wizard", async () => {
    const [brand] = await sql<{ name: string }[]>`
      SELECT name FROM brands WHERE id = ${seeded.brandId} AND deleted_at IS NULL
    `;
    expect(brand.name).toBe(E2E_AGENCY_USER.brandName);
  });
});
