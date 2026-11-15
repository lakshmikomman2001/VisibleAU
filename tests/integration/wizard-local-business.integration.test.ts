/**
 * 16 Nov, part 4 -- "Other local business", end to end on a real database: a café added through the wizard's POST
 * /api/brands as vertical local_business, classified without the vertical as a hint (lib/brands/classify-and-store.ts
 * -- the classifier itself mocked to the answer it gives a café), confirmed as Café on the brand page (PATCH
 * confirm-classification), ends with café questions in its suburb and no restaurant ones.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BrandClassification } from "@/lib/types/brand";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const currentUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
const classifier = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; domain: string; vertical: string | undefined }>,
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser.value),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
// POST /api/audits schedules the inline runners with after(), which needs a request scope; this test only checks the
// audit is created, so they're not run.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/brands/classify-brand", () => ({
  classifyBrand: vi.fn(
    async (name: string, domain: string, vertical?: string): Promise<BrandClassification> => {
      classifier.calls.push({ name, domain, vertical });
      return {
        category: "cafe",
        buyerType: "consumer",
        audience: "households",
        service: "café",
        intentSignals: [],
        competitors: [],
        auRelevance: "au_founded",
        confidence: 0.92,
      };
    },
  ),
}));

const ORG = randomUUID();
const OWNER = randomUUID();
const RUN = ORG.slice(0, 8);
let sql: postgres.Sql;
let brandId = "";

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  const { inngest } = await import("@/lib/inngest/client");
  vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] });

  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, onboarding_complete)
    VALUES (${ORG}, ${`local-biz-${RUN}`}, 'Harbour Bean', ${`local-biz-${RUN}`}, true)
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER}, ${`local-biz-${OWNER}`}, ${ORG}, ${`owner-${RUN}@example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG}, ${OWNER}, 'owner', now(), now(), true)
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_local_${RUN}`}, ${`sub_local_${RUN}`}, 'price_test', 'growth', 'monthly', 'active')
  `;
  currentUser.value = {
    id: OWNER,
    organizationId: ORG,
    email: `owner-${RUN}@example.com.au`,
    name: "Owner",
    role: "owner",
    organization: { id: ORG, name: "Harbour Bean", region: "au" },
  };
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM audits WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM users WHERE id = ${OWNER}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql.end();
});

describe("a café through 'Other local business'", () => {
  it("the wizard's POST creates it as vertical local_business", async () => {
    const { POST } = await import("@/app/api/brands/route");
    const res = await POST(
      new Request("http://localhost/api/brands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // What the wizard sends (app/(auth)/brands/wizard/wizard-form.tsx handleSubmit).
        body: JSON.stringify({
          name: "Harbour Bean",
          domain: `harbourbean-${RUN}.example.com.au`,
          vertical: "local_business",
          primaryRegions: ["NSW:Parramatta"],
          competitors: [],
          locationMode: "fixed",
          suburb: "Parramatta",
          city: "Sydney",
          state: "NSW",
          postcode: null,
          country: "Australia",
        }),
      }),
    );
    expect(res.status).toBe(201);
    brandId = ((await res.json()) as { brand: { id: string } }).brand.id;
    const [row] = await sql`SELECT vertical FROM brands WHERE id = ${brandId}`;
    expect(row.vertical).toBe("local_business");
  });

  it("is classified without the vertical as a hint", async () => {
    const { classifyAndStoreBrand } = await import("@/lib/brands/classify-and-store");
    await classifyAndStoreBrand(brandId);
    expect(classifier.calls).toHaveLength(1);
    expect(classifier.calls[0].vertical).toBeUndefined();
    const [row] = await sql`SELECT classification FROM brands WHERE id = ${brandId}`;
    expect(row.classification.category).toBe("cafe");
  });

  // 16 Nov, part 5: why the wizard no longer starts the first audit -- before confirmation, POST /api/audits refuses.
  it("before it's confirmed, an audit is refused: the wizard leaves the first one to the confirmation", async () => {
    const { POST } = await import("@/app/api/audits/route");
    const res = await POST(
      new Request("http://localhost/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandId }),
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("brand_needs_confirmation");
  });

  it("confirmed as Café, its questions are a café's, in Parramatta, and never a restaurant's", async () => {
    const { PATCH } = await import("@/app/api/brands/[brandId]/confirm-classification/route");
    const res = await PATCH(
      new Request(`http://localhost/api/brands/${brandId}/confirm-classification`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          categories: ["cafe"],
          audience: "households",
          confirmedCompetitors: [],
        }),
      }),
      { params: Promise.resolve({ brandId }) },
    );
    expect(res.status).toBe(200);
    const [row] = await sql`
      SELECT categories, category_confirmed_at, prompt_pack FROM brands WHERE id = ${brandId}
    `;
    expect(row.categories).toEqual(["cafe"]);
    expect(row.category_confirmed_at).not.toBeNull();
    const pack = row.prompt_pack as string[];
    const everyday = pack.filter((q) => !q.includes("Harbour Bean"));
    expect(everyday.length).toBeGreaterThanOrEqual(10);
    for (const q of everyday) {
      expect(q, q).toContain("Parramatta");
      expect(q, q).toMatch(/caf[eé]|coffee|brunch|breakfast/i);
      expect(q, q).not.toMatch(/restaurant|plumb|tradie/i);
    }
    expect(pack).toContain("Is Harbour Bean a good choice for a café in Parramatta?");
    const { brandBusinessLabel } = await import("@/lib/brands/business-label");
    expect(
      brandBusinessLabel({
        vertical: "local_business",
        categories: row.categories,
        categoryConfirmedAt: row.category_confirmed_at,
      }),
    ).toBe("Café");
  });

  // 16 Nov, part 5: what the confirmation card does next (startFirstAudit) -- the first audit starts.
  it("once confirmed, its first audit starts", async () => {
    const { POST } = await import("@/app/api/audits/route");
    const res = await POST(
      new Request("http://localhost/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandId }),
      }),
    );
    expect(res.status).toBe(201);
    const { auditId } = (await res.json()) as { auditId: string };
    const [audit] = await sql`SELECT brand_id FROM audits WHERE id = ${auditId}`;
    expect(audit.brand_id).toBe(brandId);
  });
});
