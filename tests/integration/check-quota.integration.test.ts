/**
 * checkQuota (lib/scheduling/quota-check.ts): whether a workspace's scheduled audits have room this month.
 *
 * Moved from tests/qa/sprint9/features/f04-check-quota/f04-check-quota.spec.ts on 10 Nov (Playwright-run
 * follow-ups, part 5): vitest that no config ran. Its fixtures set organizations.tier, but the plan comes from
 * `subscriptions` (lib/pricing/effective-tier.ts, e0dbb8e): a workspace with no subscription is Free, and
 * Free has no scheduled or automated audits at all (false whatever the count). Each workspace here gets the
 * subscription row for its plan.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkQuota } from "@/lib/scheduling/quota-check";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

let sql: ReturnType<typeof postgres>;
const made: string[] = [];

beforeAll(() => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
});

afterAll(async () => {
  for (const id of made) {
    await sql`DELETE FROM audits WHERE organization_id = ${id}`;
    await sql`DELETE FROM brands WHERE organization_id = ${id}`;
    await sql`DELETE FROM subscriptions WHERE organization_id = ${id}`;
    await sql`DELETE FROM organizations WHERE id = ${id}`;
  }
  await sql.end();
});

/** A workspace on `plan` (null: Free, no subscription), its brand, and `audits` audits created `when`. */
async function workspace(plan: string | null, audits: number, when = "now()") {
  const orgId = randomUUID();
  made.push(orgId);
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${orgId}, ${`itest-quota-${orgId}`}, 'Quota test workspace', ${`itest-quota-${orgId}`})
  `;
  if (plan) {
    await sql`
      INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
        tier, billing_interval, status, current_period_start, current_period_end)
      VALUES (${orgId}, ${`cus_quota_${orgId}`}, ${`sub_quota_${orgId}`}, 'price_quota', ${plan}, 'monthly',
        'active', now() - interval '1 day', now() + interval '30 days')
    `;
  }
  const [brand] = await sql<{ id: string }[]>`
    INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${orgId}, 'Quota Co', 'quota.example.com.au', 'tradies', 'au', ARRAY[]::text[])
    RETURNING id
  `;
  for (let i = 1; i <= audits; i++) {
    await sql.unsafe(
      `INSERT INTO audits (brand_id, organization_id, audit_number, triggered_by, status, created_at)
       VALUES ($1, $2, $3, 'scheduled', 'complete', ${when})`,
      [brand.id, orgId, i],
    );
  }
  return { orgId, brandId: brand.id };
}

describe("checkQuota -- the monthly cap on scheduled audits, by the subscription's plan", () => {
  it("Free (no subscription): no scheduled audits at all, even with none this month", async () => {
    const { orgId, brandId } = await workspace(null, 0);
    expect(await checkQuota(orgId, brandId)).toBe(false);
  });

  it("Starter: 3 of 4 this month -> room", async () => {
    const { orgId, brandId } = await workspace("starter", 3);
    expect(await checkQuota(orgId, brandId)).toBe(true);
  });

  it("Starter: 4 of 4 this month -> full", async () => {
    const { orgId, brandId } = await workspace("starter", 4);
    expect(await checkQuota(orgId, brandId)).toBe(false);
  });

  it("Growth: 12 of 12 -> full", async () => {
    const { orgId, brandId } = await workspace("growth", 12);
    expect(await checkQuota(orgId, brandId)).toBe(false);
  });

  it("Enterprise: no cap", async () => {
    const { orgId, brandId } = await workspace("enterprise", 10);
    expect(await checkQuota(orgId, brandId)).toBe(true);
  });

  it("last month's audits don't count", async () => {
    const { orgId, brandId } = await workspace(
      "starter",
      4,
      "date_trunc('month', now()) - interval '10 days'",
    );
    expect(await checkQuota(orgId, brandId)).toBe(true);
  });

  it("an organisation that doesn't exist -> no room", async () => {
    expect(await checkQuota(randomUUID(), randomUUID())).toBe(false);
  });
});
