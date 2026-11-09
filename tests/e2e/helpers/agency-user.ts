/**
 * 3 Nov -- an Agency-plan test user for the specs that visit Report branding,
 * which is Agency-plan only: E2E_TEST_USER_1 has no subscription, so it now gets
 * the locked card. Owns one workspace with one brand (with none, /dashboard sends
 * it to the wizard and a spec's sign-in wait never ends) and a live agency
 * subscription.
 *
 * In the local e2e database only: anything else is refused before connecting,
 * visibleau_prod first of all. Safe to run again. No server needed: sign-in works
 * because the password is stored the way better-auth stores it.
 *
 * Relative imports: tests/qa/* run under their own Playwright configs.
 */
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
import { assertE2eDatabaseUrl } from "./e2e-database";

export { assertE2eDatabaseUrl };

const AUTH_USER_ID = "e2e-agency-plan-user";
const ORG_KEY = "e2e-agency-plan";

export const E2E_AGENCY_USER = {
  email: "agency-plan@test.visibleau.dev",
  password: "TestPass123!",
  name: "E2E Agency Owner",
  orgName: "E2E Agency Plan",
  brandName: "E2E Agency Brand",
} as const;

export async function ensureE2eAgencyUser(
  rawUrl = process.env.TEST_DATABASE_URL,
): Promise<{ organizationId: string; authUserId: string; brandId: string }> {
  const url = assertE2eDatabaseUrl(rawUrl);
  const passwordHash = await hashPassword(E2E_AGENCY_USER.password);
  const sql = postgres(url, { max: 1 });
  try {
    return await sql.begin(async (tx) => {
      const [authUser] = await tx<{ id: string }[]>`
        INSERT INTO auth_users (id, name, email, email_verified)
        VALUES (${AUTH_USER_ID}, ${E2E_AGENCY_USER.name}, ${E2E_AGENCY_USER.email}, true)
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, email_verified = true, updated_at = now()
        RETURNING id
      `;
      await tx`
        INSERT INTO auth_accounts (id, account_id, provider_id, user_id, password)
        VALUES (${`${AUTH_USER_ID}-credential`}, ${authUser.id}, 'credential', ${authUser.id}, ${passwordHash})
        ON CONFLICT (id) DO UPDATE SET password = EXCLUDED.password, updated_at = now()
      `;

      const [org] = await tx<{ id: string }[]>`
        INSERT INTO organizations (clerk_org_id, name, slug, tier, onboarding_complete, metadata)
        VALUES (${ORG_KEY}, ${E2E_AGENCY_USER.orgName}, ${ORG_KEY}, 'agency', true, ${tx.json({ productTourComplete: true })})
        ON CONFLICT (clerk_org_id) DO UPDATE SET tier = 'agency', deleted_at = NULL, updated_at = now()
        RETURNING id
      `;
      const [user] = await tx<{ id: string }[]>`
        INSERT INTO users (clerk_user_id, organization_id, email, name, role)
        VALUES (${authUser.id}, ${org.id}, ${E2E_AGENCY_USER.email}, ${E2E_AGENCY_USER.name}, 'owner')
        ON CONFLICT (clerk_user_id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = 'owner', updated_at = now()
        RETURNING id
      `;
      const [member] = await tx<{ id: string }[]>`
        SELECT id FROM org_members WHERE organization_id = ${org.id} AND user_id = ${user.id}
      `;
      if (!member) {
        await tx`
          INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
          VALUES (${org.id}, ${user.id}, 'owner', now(), now(), true)
        `;
      }

      await tx`
        INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status, cancel_at_period_end, current_period_start, current_period_end)
        VALUES (${org.id}, ${`cus_${ORG_KEY}`}, ${`sub_${ORG_KEY}`}, 'price_e2e_agency', 'agency', 'monthly', 'active', false, now() - interval '1 day', now() + interval '30 days')
        ON CONFLICT (organization_id) DO UPDATE SET tier = 'agency', status = 'active', cancel_at_period_end = false,
          current_period_start = now() - interval '1 day', current_period_end = now() + interval '30 days', updated_at = now()
      `;

      const [existingBrand] = await tx<{ id: string }[]>`
        SELECT id FROM brands WHERE organization_id = ${org.id} AND deleted_at IS NULL LIMIT 1
      `;
      const [brand] = existingBrand
        ? [existingBrand]
        : await tx<{ id: string }[]>`
            INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions)
            VALUES (${org.id}, ${E2E_AGENCY_USER.brandName}, 'e2e-agency-plan.example.com.au', 'tradies', 'au', ${["NSW:Bondi"]})
            RETURNING id
          `;
      return { organizationId: org.id, authUserId: authUser.id, brandId: brand.id };
    });
  } finally {
    await sql.end();
  }
}

/** Removes everything ensureE2eAgencyUser made, and whatever a spec added to the workspace. */
export async function removeE2eAgencyUser(rawUrl = process.env.TEST_DATABASE_URL): Promise<void> {
  const url = assertE2eDatabaseUrl(rawUrl);
  const sql = postgres(url, { max: 1 });
  try {
    const [org] = await sql<
      { id: string }[]
    >`SELECT id FROM organizations WHERE clerk_org_id = ${ORG_KEY}`;
    if (org) {
      const tables = await sql<{ table_name: string }[]>`
        SELECT c.table_name FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'
          AND t.table_type = 'BASE TABLE' AND c.table_name <> 'organizations'
      `;
      let pending = tables.map((t) => t.table_name);
      for (let pass = 0; pass < 6 && pending.length > 0; pass++) {
        const failed: string[] = [];
        for (const table of pending) {
          try {
            await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${org.id}`;
          } catch {
            failed.push(table);
          }
        }
        pending = failed;
      }
      await sql`DELETE FROM organizations WHERE id = ${org.id}`;
    }
    const authUsers = await sql<
      { id: string }[]
    >`SELECT id FROM auth_users WHERE email = ${E2E_AGENCY_USER.email}`;
    for (const { id } of authUsers) {
      await sql`DELETE FROM auth_sessions WHERE user_id = ${id}`;
      await sql`DELETE FROM auth_accounts WHERE user_id = ${id}`;
      await sql`DELETE FROM auth_users WHERE id = ${id}`;
    }
  } finally {
    await sql.end();
  }
}
