/**
 * 13 Nov (Sri's walk-through, part 1) -- real DB, the real brand page and the real classifier writes.
 * A new brand's page shows the confirmation panel on its first load (no Save or reload), a classification
 * that failed or never finished shows "choose below", one that's running says so; a failed classify run
 * records "failed" (never a stuck "pending"), and a result that lands after the owner confirmed keeps their
 * confirmation; Re-analyse starts the wait again.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const USER_ID = randomUUID();
const LOW = randomUUID();
const STUCK = randomUUID();
const RUNNING = randomUUID();
const FAILED = randomUUID();
const CONFIRMED_MID_RUN = randomUUID();
const classify = vi.hoisted(() => ({ next: null as null | (() => Promise<unknown>) }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: USER_ID,
    organizationId: ORG_ID,
    role: "owner",
    organization: { id: ORG_ID, name: "New Brand Org", region: "au", metadata: {} },
  })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  usePathname: () => "/brands",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));
vi.mock("@/lib/brands/classify-brand", () => ({
  classifyBrand: vi.fn(async () => {
    if (!classify.next) throw new Error("no classifier set");
    return classify.next();
  }),
}));

let sql: ReturnType<typeof postgres>;
const LOW_CLASSIFICATION = {
  category: "trades_general",
  buyerType: "smb",
  competitors: ["Fixit Plumbing"],
  confidence: 0.55,
  intentSignals: [],
  auRelevance: "au_present",
};

async function insertBrand(
  id: string,
  status: string,
  updatedMinutesAgo: number,
  classification: unknown,
) {
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state,
      location_mode, location_confirmed_at, classification_status, classification, created_at, updated_at)
    VALUES (${id}, ${ORG_ID}, 'herohomeservices', ${`${id.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
      ARRAY['NSW:Yennora']::text[], 'Yennora', 'NSW', 'fixed', now(), ${status},
      ${classification === null ? null : sql.json(classification as never)},
      now() - make_interval(mins => ${updatedMinutesAgo}), now() - make_interval(mins => ${updatedMinutesAgo}))
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`new-brand-${ORG_ID}`}, 'New Brand Org', ${`new-brand-org-${ORG_ID}`})
  `;
  // The owner, so Re-analyse (manage_brands) is allowed.
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER_ID}, ${`new-brand-owner-${ORG_ID}`}, ${ORG_ID}, ${`owner-${ORG_ID.slice(0, 8)}@new-brand.example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${USER_ID}, 'owner', now(), now(), true)
  `;
  await insertBrand(LOW, "needs_confirmation", 0, LOW_CLASSIFICATION);
  await insertBrand(STUCK, "processing", 4, null);
  await insertBrand(RUNNING, "pending", 0, null);
  await insertBrand(FAILED, "failed", 0, null);
  await insertBrand(CONFIRMED_MID_RUN, "pending", 0, null);
}, 30_000);

afterAll(async () => {
  await sql`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

async function renderBrandPage(brandId: string): Promise<string> {
  const { default: Page } = await import("@/app/(auth)/brands/[brandId]/page");
  const element = await Page({ params: Promise.resolve({ brandId }) } as never);
  return renderToStaticMarkup(element as ReactElement)
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'");
}

describe("the brand page's first load", () => {
  it("a new brand classified with low confidence shows the panel at once, with its location and one line", async () => {
    const html = await renderBrandPage(LOW);
    expect(html).toContain("Confirm your business details");
    expect(html).toContain("Needs your confirmation");
    expect(html).toMatch(/data-confirm-location="".*Yennora, NSW/s);
    expect(html).toContain("Confirm your business details below to run the first audit.");
    expect(html.match(/data-blocked-line=""/g)).toHaveLength(1);
    expect(html).not.toMatch(
      /Classification pending|still running|generic fallback|takes 30 seconds/,
    );
  });

  it("a classification that never finished (4 minutes, past the 3-minute timeout) says choose below", async () => {
    const html = await renderBrandPage(STUCK);
    expect(html).toContain("We couldn't work this out automatically — choose below.");
    expect(html).toContain("Couldn't work it out — choose below");
    expect(html).toContain("Confirm your business details");
  });

  it("a failed classification shows the same panel, without the raw error", async () => {
    const html = await renderBrandPage(FAILED);
    expect(html).toContain("We couldn't work this out automatically — choose below.");
    expect(html).not.toContain("Classification failed");
  });

  it("a classification still running says so, and the panel isn't shown yet", async () => {
    const html = await renderBrandPage(RUNNING);
    expect(html).toContain("data-classification-running");
    expect(html).toContain("Working out your business type");
    expect(html).not.toContain("Confirm your business details");
  });
});

describe("the classifier's writes", () => {
  it("a failed run records failed, never a stuck pending, and stamps when it started", async () => {
    const { classifyAndStoreBrand } = await import("@/lib/brands/classify-and-store");
    classify.next = async () => {
      throw new Error("provider down");
    };
    await sql`UPDATE brands SET classification_status = 'pending' WHERE id = ${FAILED}`;
    await expect(classifyAndStoreBrand(FAILED)).rejects.toThrow("provider down");
    const [row] = await sql<{ classification_status: string; updated_at: Date }[]>`
      SELECT classification_status, updated_at FROM brands WHERE id = ${FAILED}
    `;
    expect(row.classification_status).toBe("failed");
    expect(Date.now() - row.updated_at.getTime()).toBeLessThan(60_000);
  });

  it("a result that lands after the owner confirmed keeps their confirmation (complete), and the suggestion", async () => {
    const { classifyAndStoreBrand } = await import("@/lib/brands/classify-and-store");
    classify.next = async () => {
      // The owner confirms while the classifier is working.
      await sql`
        UPDATE brands SET categories = ARRAY['trades_plumbing']::text[], audience = 'households',
          category_confirmed_at = now(), classification_status = 'complete'
        WHERE id = ${CONFIRMED_MID_RUN}
      `;
      return LOW_CLASSIFICATION;
    };
    await sql`UPDATE brands SET classification_status = 'pending' WHERE id = ${CONFIRMED_MID_RUN}`;
    await classifyAndStoreBrand(CONFIRMED_MID_RUN);
    const [row] = await sql<
      { classification_status: string; classification: { category: string } }[]
    >`
      SELECT classification_status, classification FROM brands WHERE id = ${CONFIRMED_MID_RUN}
    `;
    expect(row.classification_status).toBe("complete");
    expect(row.classification.category).toBe("trades_general");
  });

  it("Re-analyse starts the wait again: pending, from now", async () => {
    const { POST } = await import("@/app/api/brands/[brandId]/retry-classification/route");
    const res = await POST(
      new Request(`http://x/api/brands/${STUCK}/retry-classification`, { method: "POST" }),
      {
        params: Promise.resolve({ brandId: STUCK }),
      },
    );
    expect(res.status).toBe(200);
    const [row] = await sql<{ classification_status: string; updated_at: Date }[]>`
      SELECT classification_status, updated_at FROM brands WHERE id = ${STUCK}
    `;
    expect(row.classification_status).toBe("pending");
    expect(Date.now() - row.updated_at.getTime()).toBeLessThan(60_000);
    expect(await renderBrandPage(STUCK)).toContain("data-classification-running");
  });
});
