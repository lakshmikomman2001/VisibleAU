import postgres from "postgres";

export const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau_test";

export const OWNER_ORG_ID = "00000000-a2b1-4000-a000-000000000001";
export const OWNER_USER_ID = "00000000-a2b1-4000-a000-000000000010";
export const OWNER_BRAND_ID = "00000000-a2b1-4000-a000-000000000100";

export const OTHER_ORG_ID = "00000000-a2b2-4000-a000-000000000002";
export const OTHER_USER_ID = "00000000-a2b2-4000-a000-000000000020";

export function createTestClient() {
  return postgres(TEST_DB_URL, { max: 3 });
}

export async function assertTestDatabase(client: ReturnType<typeof postgres>) {
  const [row] = await client`SELECT current_database() AS db`;
  if (row.db !== "visibleau_test") {
    throw new Error(`SAFETY: expected 'visibleau_test', got '${row.db}' — ABORTING`);
  }
}

export async function seedFixtures(client: ReturnType<typeof postgres>) {
  // Org 1: owner org (growth tier via subscriptions, but organizations.tier stays 'free' to catch wrong reads)
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier, region)
    VALUES (${OWNER_ORG_ID}, 's2-owner-org-a2b1', 'S2 Owner Org', 's2-owner', 'free', 'au')
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name)
    VALUES (${OWNER_USER_ID}, 's2-owner-user-a2b1', ${OWNER_ORG_ID}, 's2-owner@test.local', 'S2 Owner')
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO org_members (organization_id, user_id, role, is_active)
    VALUES (${OWNER_ORG_ID}, ${OWNER_USER_ID}, 'owner', true)
    ON CONFLICT (organization_id, user_id) DO NOTHING
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${OWNER_BRAND_ID}, ${OWNER_ORG_ID}, 'S2 Test Brand', 's2-test.local', 'tradies', 'au', ARRAY['VIC:Melbourne'])
    ON CONFLICT (id) DO NOTHING
  `;
  // Subscription: growth tier (organizations.tier is 'free' — tests must read subscriptions.tier)
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status, metadata)
    VALUES (${OWNER_ORG_ID}, 'cus_s2test', 'sub_s2test', 'price_s2test', 'growth', 'monthly', 'active', '{}')
    ON CONFLICT (organization_id) DO NOTHING
  `;

  // Org 2: non-owner org (for cross-org tests)
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier, region)
    VALUES (${OTHER_ORG_ID}, 's2-other-org-a2b2', 'S2 Other Org', 's2-other', 'free', 'au')
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name)
    VALUES (${OTHER_USER_ID}, 's2-other-user-a2b2', ${OTHER_ORG_ID}, 's2-other@test.local', 'S2 Other')
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO org_members (organization_id, user_id, role, is_active)
    VALUES (${OTHER_ORG_ID}, ${OTHER_USER_ID}, 'owner', true)
    ON CONFLICT (organization_id, user_id) DO NOTHING
  `;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status, metadata)
    VALUES (${OTHER_ORG_ID}, 'cus_s2other', 'sub_s2other', 'price_s2other', 'starter', 'monthly', 'active', '{}')
    ON CONFLICT (organization_id) DO NOTHING
  `;

  // Bot registry: GPTBot (for crawler/metrics tests)
  await client`
    INSERT INTO ai_bot_registry (ua_token, match_mode, vendor, crawler_tier, default_purpose, is_agent_ua, ai_platform, verification_paths, cidr_source_url, ptr_domain_suffix, expected_asns, respects_robots, is_active)
    VALUES ('GPTBot', 'substring', 'openai', 'must_allow', 'indexing', false, 'openai', '["cidr","fcrdns","asn"]', 'https://openai.com/gptbot-ranges.json', '.openai.com', ARRAY[394161], true, true)
    ON CONFLICT (ua_token) DO NOTHING
  `;
}

export async function truncateTestTables(client: ReturnType<typeof postgres>) {
  await client`TRUNCATE crawler_visit_logs, ai_referral_hits, ai_bot_ip_ranges, remediation_tasks RESTART IDENTITY CASCADE`;
}

export async function teardownFixtures(client: ReturnType<typeof postgres>) {
  await client`TRUNCATE crawler_visit_logs, ai_referral_hits, ai_bot_ip_ranges, remediation_tasks RESTART IDENTITY CASCADE`;
  await client`DELETE FROM org_members WHERE organization_id IN (${OWNER_ORG_ID}, ${OTHER_ORG_ID})`;
  await client`DELETE FROM subscriptions WHERE organization_id IN (${OWNER_ORG_ID}, ${OTHER_ORG_ID})`;
  await client`DELETE FROM brands WHERE id = ${OWNER_BRAND_ID}`;
  await client`DELETE FROM users WHERE id IN (${OWNER_USER_ID}, ${OTHER_USER_ID})`;
  await client`DELETE FROM organizations WHERE id IN (${OWNER_ORG_ID}, ${OTHER_ORG_ID})`;
  await client`DELETE FROM ai_bot_registry WHERE ua_token = 'GPTBot'`;
}

export function makeOwnerUser() {
  return {
    id: OWNER_USER_ID,
    clerkUserId: "s2-owner-user-a2b1",
    organizationId: OWNER_ORG_ID,
    email: "s2-owner@test.local",
    name: "S2 Owner",
    role: "member",
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: {
      id: OWNER_ORG_ID,
      clerkOrgId: "s2-owner-org-a2b1",
      name: "S2 Owner Org",
      slug: "s2-owner",
      region: "au",
      tier: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionCancelledAt: null,
      onboardingComplete: false,
      ga4MeasurementId: null,
      ga4ApiSecret: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
  };
}

export function makeOtherUser() {
  return {
    id: OTHER_USER_ID,
    clerkUserId: "s2-other-user-a2b2",
    organizationId: OTHER_ORG_ID,
    email: "s2-other@test.local",
    name: "S2 Other",
    role: "member",
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: {
      id: OTHER_ORG_ID,
      clerkOrgId: "s2-other-org-a2b2",
      name: "S2 Other Org",
      slug: "s2-other",
      region: "au",
      tier: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionCancelledAt: null,
      onboardingComplete: false,
      ga4MeasurementId: null,
      ga4ApiSecret: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
  };
}

export function makeStarterUser() {
  // Same org as owner but with a starter-tier subscription (used for tier gate tests)
  // We'll modify the subscription tier in the test
  return makeOwnerUser();
}
