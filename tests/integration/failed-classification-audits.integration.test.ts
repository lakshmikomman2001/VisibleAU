/**
 * 16 Nov, part 6 -- a failed classification must not block audits. Before: the classifier failed (classification NULL,
 * status 'failed'), the owner confirmed a business type anyway (PATCH confirm-classification sets status 'complete'),
 * and regeneratePromptPack returned without writing a question set (it required a stored classification), so the
 * brand stayed stamped behind PROMPT_GENERATOR_VERSION and every audit threw PromptPackGenerationError ("Could not
 * refresh this brand's questions before running the audit (it's still stamped with an old generator version after
 * regenerating)") -- and the classifier never retried, the brand being 'complete'. Now a confirmed business type always
 * gives a question set, built from what the owner confirmed (the general local type as the floor).
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const currentUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser.value),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const ORG = randomUUID();
const OWNER = randomUUID();
const CAFE = randomUUID();
const UNPLACED = randomUUID();
const RUN = ORG.slice(0, 8);
let sql: postgres.Sql;

async function confirm(brandId: string, categories: string[]) {
  const { PATCH } = await import("@/app/api/brands/[brandId]/confirm-classification/route");
  return PATCH(
    new Request(`http://localhost/api/brands/${brandId}/confirm-classification`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categories, audience: "households", confirmedCompetitors: [] }),
    }),
    { params: Promise.resolve({ brandId }) },
  );
}

async function auditQuestions(brandId: string) {
  const { db } = await import("@/db/client");
  const { brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
  const { getAuditPrompts } = await import("@/lib/audit/get-audit-prompts");
  return getAuditPrompts(brand, 10);
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, onboarding_complete)
    VALUES (${ORG}, ${`failed-class-${RUN}`}, 'Failed Classification Co', ${`failed-class-${RUN}`}, true)
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER}, ${`failed-class-${OWNER}`}, ${ORG}, ${`owner-${RUN}@example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG}, ${OWNER}, 'owner', now(), now(), true)
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_fc_${RUN}`}, ${`sub_fc_${RUN}`}, 'price_test', 'agency', 'monthly', 'active')
  `;
  // Two brands whose classifier failed: no classification stored, status 'failed' -- what classify-and-store writes.
  for (const [id, name] of [
    [CAFE, "Harbour Bean"],
    [UNPLACED, "Parramatta Pooch Spa"],
  ]) {
    await sql`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions,
                          classification, classification_status, classification_error,
                          location_mode, suburb, city, state, country, location_confirmed_at)
      VALUES (${id}, ${ORG}, ${name}, ${`${id.slice(0, 8)}.example.com.au`}, 'local_business', 'au',
              ${["NSW:Parramatta"]}, NULL, 'failed', 'Claude timed out',
              'fixed', 'Parramatta', 'Sydney', 'NSW', 'Australia', now())
    `;
  }
  currentUser.value = {
    id: OWNER,
    organizationId: ORG,
    email: `owner-${RUN}@example.com.au`,
    name: "Owner",
    role: "owner",
    organization: { id: ORG, name: "Failed Classification Co", region: "au" },
  };
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM users WHERE id = ${OWNER}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql.end();
});

describe("a brand whose classification failed, confirmed by its owner", () => {
  it("gets a question set from what the owner confirmed (Café), and audits run on it", async () => {
    expect((await confirm(CAFE, ["cafe"])).status).toBe(200);
    const { PROMPT_GENERATOR_VERSION } = await import("@/lib/prompts/generator-version");
    const [row] = await sql`
      SELECT prompt_pack, prompt_pack_generator_version FROM brands WHERE id = ${CAFE}
    `;
    expect(row.prompt_pack_generator_version).toBe(PROMPT_GENERATOR_VERSION);
    expect((row.prompt_pack as string[]).length).toBeGreaterThanOrEqual(10);

    const questions = await auditQuestions(CAFE);
    const everyday = questions.filter((q) => !q.isBranded).map((q) => q.text);
    expect(everyday.length).toBeGreaterThanOrEqual(10);
    for (const q of everyday) {
      expect(q, q).toContain("Parramatta");
      expect(q, q).toMatch(/caf[eé]|coffee|brunch|breakfast/i);
    }
  });

  it("confirmed as a local business with no service words known, it still audits: the general local floor", async () => {
    expect((await confirm(UNPLACED, ["general"])).status).toBe(200);
    const questions = await auditQuestions(UNPLACED);
    const everyday = questions.filter((q) => !q.isBranded).map((q) => q.text);
    expect(everyday.length).toBeGreaterThanOrEqual(10);
    for (const q of everyday) expect(q, q).toMatch(/local business.*Parramatta/i);
  });
});
