/**
 * Task #46 (7th follow-up): the fixed-ID org/brand/user rows several
 * pre-existing integration tests assume already exist (previously
 * only true on the local visibleau_prod mirror -- see the 5 files
 * repointed onto visibleau_e2e in this same follow-up).
 *
 * tests/integration/global-setup.ts seeds these ONCE, before the
 * whole suite. That alone isn't safe: tests/phase2/sprint4/helpers/
 * test-db.ts's `truncateAll()` (used by two sprint4 integration tests
 * for their own full-isolation strategy) runs `TRUNCATE organizations,
 * brands, ... CASCADE` against the same visibleau_e2e database --
 * discovered when a full-suite run intermittently wiped these fixtures
 * out from under a later file, depending on file execution order.
 * Every file that depends on these rows existing calls
 * `ensureSharedFixtures(client)` defensively in its OWN `beforeAll`,
 * not just relying on the one-time global seed.
 */
import type postgres from "postgres";

export const SHARED_FIXTURE_ORG_A = {
  id: "31a7c684-35b1-4340-a24d-4f8898f252a5",
  clerkOrgId: "MKgqZzwpqMGgkusEXmWHfNNddbXOV5tz",
  name: "VisibleAU Dev",
  slug: "visibleau-dev",
};
export const SHARED_FIXTURE_ORG_B = {
  id: "21ac96a7-fe8a-4145-b15b-ce32300b68da",
  clerkOrgId: "R2cVaWmldWiAy94962NZyT5XhZWa6ttw",
  name: "Test Agency 2",
  slug: "test-agency-2",
};
export const SHARED_FIXTURE_BRAND = {
  id: "358e8579-0282-4c1d-908f-af3746babdc8",
  organizationId: SHARED_FIXTURE_ORG_A.id,
  name: "Canva",
  domain: "canva.com",
};
export const SHARED_FIXTURE_USER = {
  id: "dcae4ffd-abb6-46c2-9812-6bb8faaffe3b",
  clerkUserId: "CFezIYq42i2uMGUMABiBpfUuNXiBmLBM",
  organizationId: SHARED_FIXTURE_ORG_A.id,
  email: "sri@visibleau.local",
  name: "Sri (Dev)",
};

export async function ensureSharedFixtures(client: ReturnType<typeof postgres>): Promise<void> {
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug, region, tier)
    VALUES (${SHARED_FIXTURE_ORG_A.id}, ${SHARED_FIXTURE_ORG_A.clerkOrgId}, ${SHARED_FIXTURE_ORG_A.name}, ${SHARED_FIXTURE_ORG_A.slug}, 'au', 'agency')
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug, region, tier)
    VALUES (${SHARED_FIXTURE_ORG_B.id}, ${SHARED_FIXTURE_ORG_B.clerkOrgId}, ${SHARED_FIXTURE_ORG_B.name}, ${SHARED_FIXTURE_ORG_B.slug}, 'au', 'agency')
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${SHARED_FIXTURE_BRAND.id}, ${SHARED_FIXTURE_BRAND.organizationId}, ${SHARED_FIXTURE_BRAND.name}, ${SHARED_FIXTURE_BRAND.domain},
      'saas', 'au', ARRAY['NSW:Sydney CBD'], ARRAY['Adobe Express','Figma','Microsoft Designer'])
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${SHARED_FIXTURE_USER.id}, ${SHARED_FIXTURE_USER.clerkUserId}, ${SHARED_FIXTURE_USER.organizationId}, ${SHARED_FIXTURE_USER.email}, ${SHARED_FIXTURE_USER.name}, 'owner')
    ON CONFLICT (id) DO NOTHING
  `;
}
