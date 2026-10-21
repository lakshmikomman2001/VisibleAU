/**
 * Vunnara (21 Oct, "directory listings... never scraping", Part C) --
 * real-DB proof that brand_directory_listings is RLS-isolated per
 * organization (FORCE RLS, not just ENABLE -- a query outside an
 * RLS-scoped transaction sees nothing, same as `brands`), and that the
 * API route validates a pasted profile link by host + the registry's
 * own pattern without ever fetching it.
 *
 * ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalSafeDatabaseUrl } from "@/scripts/db/local-db-guard";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_A_ID = randomUUID();
const ORG_B_ID = randomUUID();
const BRAND_A_ID = randomUUID();
const BRAND_B_ID = randomUUID();
const USER_A_ID = randomUUID();

let client: ReturnType<typeof postgres>;
// Vunnara: withRlsContext's own `db` connects via DATABASE_URL -- which
// every integration test's own beforeAll (including this file's)
// points at the local superuser (postgres:password@.../visibleau_e2e,
// .env.test.local), not visibleau_app. A superuser (or any BYPASSRLS
// role) bypasses row security UNCONDITIONALLY in Postgres -- FORCE ROW
// LEVEL SECURITY only ever changes whether the TABLE OWNER is subject
// to RLS, never a superuser. So a cross-org denial can only be proven
// by actually connecting as visibleau_app, the real NOSUPERUSER/
// NOBYPASSRLS role db/client.ts's own comment names -- this is a real
// gap shared by every other "RLS" test in this codebase that only ever
// exercises withRlsContext's happy path (same org reading its own
// data), which would pass identically whether or not RLS is actually
// enforced. Flagged in this hotfix's report-back; not fixed globally
// here (changing every integration test's connection role is a much
// larger, separate change). Password is the documented local dev one
// (scripts/db/tier1a-app-role.sql) -- this role has no password this
// test invents or sends anywhere outside localhost.
function appRoleUrl(): string {
  const base = new URL(getTestDatabaseUrl());
  base.username = "visibleau_app";
  base.password = "visibleau_app_dev";
  const url = base.toString();
  assertLocalSafeDatabaseUrl(url);
  return url;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  for (const [orgId, brandId, slugSeed] of [
    [ORG_A_ID, BRAND_A_ID, "a"],
    [ORG_B_ID, BRAND_B_ID, "b"],
  ] as const) {
    await client`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${orgId}, ${`bdl-${slugSeed}-${orgId}`}, ${`BDL Org ${slugSeed}`}, ${`bdl-org-${slugSeed}-${orgId}`})
    `;
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors,
        categories, category_confirmed_at, audience)
      VALUES (${brandId}, ${orgId}, ${`BDL Brand ${slugSeed}`}, ${`bdl-${slugSeed}-${randomUUID()}.example.com.au`}, 'tradies', 'au',
        ARRAY['NSW:Sydney'], ARRAY[]::text[], ARRAY['trades_general'], now(), 'households')
    `;
  }

  // Vunnara: brand_directory_listings.confirmed_by is a real FK to
  // users.id -- the PUT route's success-path test mocks getCurrentUser
  // but must still hand back a user id that actually exists, or the
  // insert fails closed on the FK rather than proving anything about
  // validation.
  await client`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER_A_ID}, ${`bdl-user-a-${USER_A_ID}`}, ${ORG_A_ID}, ${`bdl-user-a-${USER_A_ID}@test.local`}, 'BDL User A', 'owner')
  `;
});

afterAll(async () => {
  await client`DELETE FROM brand_directory_listings WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})`;
  // The success-path PUT test's recordAction() call writes a real
  // audit_trail row for USER_A_ID -- that FK must go before the user.
  await client`DELETE FROM audit_trail WHERE user_id = ${USER_A_ID}`;
  await client`DELETE FROM users WHERE id = ${USER_A_ID}`;
  await client`DELETE FROM brands WHERE id IN (${BRAND_A_ID}, ${BRAND_B_ID})`;
  await client`DELETE FROM organizations WHERE id IN (${ORG_A_ID}, ${ORG_B_ID})`;
  await client.end();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("brand_directory_listings -- RLS isolation (real DB, FORCE RLS)", () => {
  it("org A can insert and read back its own row inside its own RLS context", async () => {
    const { withRlsContext } = await import("@/db/client");
    const { brandDirectoryListings } = await import("@/db/schema");

    const row = await withRlsContext(ORG_A_ID, async (tx) => {
      const [inserted] = await tx
        .insert(brandDirectoryListings)
        .values({
          organizationId: ORG_A_ID,
          brandId: BRAND_A_ID,
          directoryKey: "hipages",
          status: "listed",
          profileUrl: "https://hipages.com.au/connect/bdl-test-brand",
          confirmedAt: new Date(),
        })
        .returning();
      return inserted;
    });
    expect(row.status).toBe("listed");

    const readBack = await withRlsContext(ORG_A_ID, (tx) =>
      tx.query.brandDirectoryListings.findFirst({
        where: (t, { eq }) => eq(t.brandId, BRAND_A_ID),
      }),
    );
    expect(readBack?.directoryKey).toBe("hipages");
  });

  it("as visibleau_app, org B's RLS context sees ZERO rows for org A's brand, even querying by brand_id directly", async () => {
    const appClient = postgres(appRoleUrl(), { max: 1 });
    try {
      const rows = await appClient.begin(async (tx) => {
        await tx`SELECT set_config('app.current_org_id', ${ORG_B_ID}, true)`;
        return tx`SELECT * FROM brand_directory_listings WHERE brand_id = ${BRAND_A_ID}`;
      });
      expect(rows).toEqual([]);
    } finally {
      await appClient.end();
    }
  });

  it("as visibleau_app, org B's RLS context cannot UPDATE org A's row either -- FORCE RLS blocks it, not just hides it from SELECT", async () => {
    const appClient = postgres(appRoleUrl(), { max: 1 });
    try {
      await appClient.begin(async (tx) => {
        await tx`SELECT set_config('app.current_org_id', ${ORG_B_ID}, true)`;
        await tx`UPDATE brand_directory_listings SET status = 'not_listed' WHERE brand_id = ${BRAND_A_ID}`;
      });
    } finally {
      await appClient.end();
    }

    const [stillA] = await client`
      SELECT status FROM brand_directory_listings WHERE brand_id = ${BRAND_A_ID} AND directory_key = 'hipages'
    `;
    expect(stillA.status).toBe("listed"); // unchanged -- org B's update (WITH CHECK's own org_id) touched 0 rows
  });

  it("as visibleau_app, a query with NO RLS context set fails closed, not open (FORCE RLS)", async () => {
    const appClient = postgres(appRoleUrl(), { max: 1 });
    try {
      const rows = await appClient`SELECT * FROM brand_directory_listings WHERE brand_id = ${BRAND_A_ID}`;
      // No app.current_org_id set at all -> current_setting(...) is
      // NULL -> the policy's equality check is never true for any row.
      expect(rows).toEqual([]);
    } finally {
      await appClient.end();
    }
  });

  it("re-confirming the same directory UPDATEs the one row (unique brand_id+directory_key), never inserts a second", async () => {
    const { withRlsContext } = await import("@/db/client");
    const { brandDirectoryListings } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    await withRlsContext(ORG_A_ID, (tx) =>
      tx
        .insert(brandDirectoryListings)
        .values({
          organizationId: ORG_A_ID,
          brandId: BRAND_A_ID,
          directoryKey: "oneflare",
          status: "unsure",
          confirmedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [brandDirectoryListings.brandId, brandDirectoryListings.directoryKey],
          set: { status: "unsure", confirmedAt: new Date() },
        }),
    );
    await withRlsContext(ORG_A_ID, (tx) =>
      tx
        .insert(brandDirectoryListings)
        .values({
          organizationId: ORG_A_ID,
          brandId: BRAND_A_ID,
          directoryKey: "oneflare",
          status: "not_listed",
          confirmedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [brandDirectoryListings.brandId, brandDirectoryListings.directoryKey],
          set: { status: "not_listed", confirmedAt: new Date() },
        }),
    );

    const rows = await withRlsContext(ORG_A_ID, (tx) =>
      tx
        .select()
        .from(brandDirectoryListings)
        .where(eq(brandDirectoryListings.directoryKey, "oneflare")),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("not_listed");
  });
});

// Vunnara: a single stable, hoisted mock for the whole PUT describe
// block below, mutated per test via `mocks.currentUser`, instead of a
// fresh `vi.doMock` + `vi.doUnmock` pair per test. The route module is
// dynamically imported once per test (via callPut) but Vitest caches
// that import across the file -- its already-bound `getCurrentUser`
// reference would otherwise stay pinned to whichever `vi.doMock`
// factory was active the FIRST time the route module was evaluated,
// silently ignoring every later re-mock (confirmed the hard way: the
// last PUT test kept inserting an earlier test's random, non-existent
// user id into confirmed_by, violating its FK, even after this test's
// own mock was changed to a real seeded user). Reading `mocks.currentUser`
// at CALL time, not at import/bind time, sidesteps that entirely.
const mocks = vi.hoisted(() => ({
  currentUser: { id: "", organizationId: "", organization: { id: "" } },
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: () => Promise.resolve(mocks.currentUser),
}));

vi.mock("@/lib/governance", () => ({
  assertBrandAccess: vi.fn().mockResolvedValue(undefined),
  BrandAccessDeniedError: class BrandAccessDeniedError extends Error {},
}));

describe("PUT /api/brands/[brandId]/directory-listings -- validates by pattern, never fetches", () => {
  async function callPut(brandId: string, body: unknown) {
    const { PUT } = await import("@/app/api/brands/[brandId]/directory-listings/route");
    const req = new Request(`http://localhost/api/brands/${brandId}/directory-listings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return PUT(req, { params: Promise.resolve({ brandId }) });
  }

  it("a hipages link that isn't the real /connect/ profile shape is rejected -- the exact bug Part A removed", async () => {
    mocks.currentUser = { id: randomUUID(), organizationId: ORG_A_ID, organization: { id: ORG_A_ID } };
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await callPut(BRAND_A_ID, {
      directoryKey: "hipages",
      status: "listed",
      profileUrl: "https://hipages.com.au/find/plumbers",
    });
    expect(res.status).toBe(400);
    // Never fetches the pasted link to "check" it -- validated by
    // pattern alone.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("status 'listed' with no profileUrl at all is rejected, never silently stored without a link", async () => {
    mocks.currentUser = { id: randomUUID(), organizationId: ORG_A_ID, organization: { id: ORG_A_ID } };

    const res = await callPut(BRAND_A_ID, { directoryKey: "hipages", status: "listed" });
    expect(res.status).toBe(400);
  });

  it("an unknown directory key is rejected", async () => {
    mocks.currentUser = { id: randomUUID(), organizationId: ORG_A_ID, organization: { id: ORG_A_ID } };

    const res = await callPut(BRAND_A_ID, { directoryKey: "not-a-real-directory", status: "not_listed" });
    expect(res.status).toBe(400);
  });

  it("a disabled (US) directory key is rejected even though it's a real registry key", async () => {
    mocks.currentUser = { id: randomUUID(), organizationId: ORG_A_ID, organization: { id: ORG_A_ID } };

    const res = await callPut(BRAND_A_ID, { directoryKey: "yelp", status: "not_listed" });
    expect(res.status).toBe(400);
  });

  it("a real hipages /connect/ link is accepted, persisted, and recorded in the audit trail", async () => {
    mocks.currentUser = { id: USER_A_ID, organizationId: ORG_A_ID, organization: { id: ORG_A_ID } };

    const res = await callPut(BRAND_A_ID, {
      directoryKey: "serviceseeking",
      status: "listed",
      profileUrl: "https://serviceseeking.com.au/profile/bdl-test",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("listed");

    const trail = await client`
      SELECT action, resource_type, metadata FROM audit_trail
      WHERE action = 'directory_listing_confirmed' AND resource_type = 'directory_listing'
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(trail.length).toBeGreaterThan(0);
    expect(trail[0].metadata).toMatchObject({ brandId: BRAND_A_ID, directoryKey: "serviceseeking" });
  });
});
