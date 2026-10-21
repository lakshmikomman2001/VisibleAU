/**
 * Sri, 21 Oct follow-up (0086 addendum) -- real-DB proof that
 * brand_directory_listings fits how brand/user deletion actually work
 * in this codebase:
 *
 *   - Brand deletion (app/api/brands/[brandId]/route.ts's DELETE) is a
 *     SOFT delete (brands.deleted_at) -- it never issues a hard DELETE,
 *     so the NO ACTION foreign keys every brand-child table uses
 *     (confirmed via diag-c07: all 34 FKs to brands(id), covering
 *     audits, action_items, brand_entity_scores, etc.) are never
 *     exercised by this path at all. A brand with directory listings
 *     must behave exactly like a brand with audits: 204, deleted_at
 *     set, every child row left untouched.
 *   - There is no account-deletion feature anywhere in this codebase
 *     (grepped: every `.delete(users)` / `DELETE FROM users` hit is
 *     test cleanup, none is live app code) -- "removing a member"
 *     (app/api/organizations/[orgId]/members/[memberId]/route.ts's
 *     DELETE) only ever touches org_members (hard-deletes an
 *     unaccepted invite, or sets is_active = false for an accepted
 *     one), never users itself. brand_directory_listings.confirmed_by
 *     is exactly as safe as every other user-linked table
 *     (audit_trail, remediation_tasks, ...) for the same reason: there
 *     is nothing that deletes what it points to.
 *
 * ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const OWNER_USER_ID = randomUUID();
const CONFIRMER_USER_ID = randomUUID();
const OWNER_MEMBER_ID = randomUUID();
const CONFIRMER_MEMBER_ID = randomUUID();
const BRAND_WITH_AUDIT_ID = randomUUID();
const BRAND_WITH_LISTING_ID = randomUUID();
const AUDIT_ID = randomUUID();

let client: ReturnType<typeof postgres>;

const mocks = vi.hoisted(() => ({
  currentUser: { id: "", organizationId: "", role: "owner" as string, organization: { id: "" } },
}));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: () => Promise.resolve(mocks.currentUser),
}));

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`bdld-org-${ORG_ID}`}, 'BDLD Org', ${`bdld-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER_USER_ID}, ${`bdld-owner-${OWNER_USER_ID}`}, ${ORG_ID}, ${`bdld-owner-${OWNER_USER_ID}@test.local`}, 'BDLD Owner', 'owner')
  `;
  await client`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${CONFIRMER_USER_ID}, ${`bdld-confirmer-${CONFIRMER_USER_ID}`}, ${ORG_ID}, ${`bdld-confirmer-${CONFIRMER_USER_ID}@test.local`}, 'BDLD Confirmer', 'viewer')
  `;
  await client`
    INSERT INTO org_members (id, organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${OWNER_MEMBER_ID}, ${ORG_ID}, ${OWNER_USER_ID}, 'owner', now() + interval '1 year', now(), true)
  `;
  await client`
    INSERT INTO org_members (id, organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${CONFIRMER_MEMBER_ID}, ${ORG_ID}, ${CONFIRMER_USER_ID}, 'viewer', now() + interval '1 year', now(), true)
  `;

  for (const [brandId, slugSeed] of [
    [BRAND_WITH_AUDIT_ID, "audit"],
    [BRAND_WITH_LISTING_ID, "listing"],
  ] as const) {
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors,
        categories, category_confirmed_at, audience)
      VALUES (${brandId}, ${ORG_ID}, ${`BDLD Brand ${slugSeed}`}, ${`bdld-${slugSeed}-${randomUUID()}.example.com.au`}, 'tradies', 'au',
        ARRAY['NSW:Sydney'], ARRAY[]::text[], ARRAY['trades_general'], now(), 'households')
    `;
  }

  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, triggered_by)
    VALUES (${AUDIT_ID}, ${BRAND_WITH_AUDIT_ID}, ${ORG_ID}, 1, 'complete', 'manual')
  `;
  await client`
    INSERT INTO brand_directory_listings (organization_id, brand_id, directory_key, status, profile_url, confirmed_at, confirmed_by)
    VALUES (${ORG_ID}, ${BRAND_WITH_LISTING_ID}, 'hipages', 'listed', 'https://hipages.com.au/connect/bdld-test', now(), ${CONFIRMER_USER_ID})
  `;
});

afterAll(async () => {
  await client`DELETE FROM brand_directory_listings WHERE brand_id = ${BRAND_WITH_LISTING_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id IN (${BRAND_WITH_AUDIT_ID}, ${BRAND_WITH_LISTING_ID})`;
  await client`DELETE FROM audit_trail WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM users WHERE id IN (${OWNER_USER_ID}, ${CONFIRMER_USER_ID})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("brand deletion (soft delete) treats brand_directory_listings exactly like audits", () => {
  async function callDeleteBrand(brandId: string) {
    const { DELETE } = await import("@/app/api/brands/[brandId]/route");
    const req = new Request(`http://localhost/api/brands/${brandId}`, { method: "DELETE" });
    return DELETE(req, { params: Promise.resolve({ brandId }) });
  }

  it("a brand with an audit soft-deletes cleanly: 204, deleted_at set, the audit row untouched", async () => {
    mocks.currentUser = { id: OWNER_USER_ID, organizationId: ORG_ID, role: "owner", organization: { id: ORG_ID } };

    const res = await callDeleteBrand(BRAND_WITH_AUDIT_ID);
    expect(res.status).toBe(204);

    const [brand] = await client`SELECT deleted_at FROM brands WHERE id = ${BRAND_WITH_AUDIT_ID}`;
    expect(brand.deleted_at).not.toBeNull();

    const audits = await client`SELECT id FROM audits WHERE id = ${AUDIT_ID}`;
    expect(audits.length).toBe(1); // never touched -- NO ACTION FK was never exercised
  });

  it("a brand with a directory listing soft-deletes with the SAME outcome, no foreign-key error, the listing row untouched", async () => {
    mocks.currentUser = { id: OWNER_USER_ID, organizationId: ORG_ID, role: "owner", organization: { id: ORG_ID } };

    const res = await callDeleteBrand(BRAND_WITH_LISTING_ID);
    expect(res.status).toBe(204); // identical status to the audits case above

    const [brand] = await client`SELECT deleted_at FROM brands WHERE id = ${BRAND_WITH_LISTING_ID}`;
    expect(brand.deleted_at).not.toBeNull();

    const listings = await client`
      SELECT status, confirmed_by FROM brand_directory_listings WHERE brand_id = ${BRAND_WITH_LISTING_ID}
    `;
    expect(listings.length).toBe(1); // never touched, never cascaded, never orphaned
    expect(listings[0].status).toBe("listed");
    expect(listings[0].confirmed_by).toBe(CONFIRMER_USER_ID);
  });

  // Relies on the preceding test having already soft-deleted
  // BRAND_WITH_LISTING_ID (vitest runs `it`s within one file in
  // declaration order unless marked .concurrent, same ordering
  // assumption the sibling RLS test file already relies on).
  it("the now soft-deleted brand's directory-listings GET route rejects it, never serving a deleted brand's listings", async () => {
    const { GET } = await import("@/app/api/brands/[brandId]/directory-listings/route");
    mocks.currentUser = { id: OWNER_USER_ID, organizationId: ORG_ID, role: "owner", organization: { id: ORG_ID } };

    // @/lib/governance is deliberately NOT mocked here -- the REAL
    // assertBrandAccess (lib/governance/access-control.ts) already
    // filters isNull(brands.deletedAt) in its own query, so a
    // soft-deleted brand is rejected at this, the FIRST gate every
    // brand-scoped route shares, before the route's own getBrandForOrg
    // check (also isNull(deletedAt)-filtered) is ever reached.
    const req = new Request(`http://localhost/api/brands/${BRAND_WITH_LISTING_ID}/directory-listings`);
    const res = await GET(req, { params: Promise.resolve({ brandId: BRAND_WITH_LISTING_ID }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Brand access denied");
  });
});

describe("removing an org member never orphans brand_directory_listings.confirmed_by", () => {
  it("removing (deactivating) the member who confirmed a listing leaves their user row and the listing's confirmed_by intact", async () => {
    mocks.currentUser = { id: OWNER_USER_ID, organizationId: ORG_ID, role: "owner", organization: { id: ORG_ID } };

    const { DELETE } = await import(
      "@/app/api/organizations/[orgId]/members/[memberId]/route"
    );
    const req = new Request(
      `http://localhost/api/organizations/${ORG_ID}/members/${CONFIRMER_MEMBER_ID}`,
      { method: "DELETE" },
    );
    const res = await DELETE(req, {
      params: Promise.resolve({ orgId: ORG_ID, memberId: CONFIRMER_MEMBER_ID }),
    });
    expect(res.status).toBe(200);

    // The membership is deactivated (it had an acceptedAt) -- never a
    // hard delete of org_members, and users.id is never touched by
    // this route at all.
    const [member] = await client`SELECT is_active FROM org_members WHERE id = ${CONFIRMER_MEMBER_ID}`;
    expect(member.is_active).toBe(false);

    const users = await client`SELECT id FROM users WHERE id = ${CONFIRMER_USER_ID}`;
    expect(users.length).toBe(1); // still exists -- nothing in this codebase ever deletes a users row

    const [listing] = await client`
      SELECT confirmed_by FROM brand_directory_listings WHERE brand_id = ${BRAND_WITH_LISTING_ID}
    `;
    expect(listing.confirmed_by).toBe(CONFIRMER_USER_ID); // unchanged, never orphaned
  });
});
