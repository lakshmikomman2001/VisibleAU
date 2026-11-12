/**
 * 13 Nov (Sri's walk-through, part 2) -- the name round trip, real DB and routes. Sri renamed
 * "herohomeservices" to "Hero Home Services" while the brand still needed confirmation, and the name
 * looked unchanged. Reproduced: the save itself stores the name (also while confirmation is pending), and
 * the page's heading and breadcrumb read it on the refresh; what didn't follow were the top bar's brand
 * switcher (it reloads its own list on BRANDS_CHANGED_EVENT now, the unit test) and the audit's questions:
 * the frozen pack kept "Is herohomeservices a good choice ...?" -- a rename regenerates it now.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const USER_ID = randomUUID();
const PENDING = randomUUID();
const READY = randomUUID();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: USER_ID,
    organizationId: ORG_ID,
    role: "owner",
    organization: { id: ORG_ID, name: "Rename Org", region: "au", metadata: {} },
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

let sql: ReturnType<typeof postgres>;
const CLASSIFICATION = {
  category: "trades_plumbing",
  buyerType: "smb",
  competitors: [],
  confidence: 0.9,
  intentSignals: [],
  auRelevance: "au_present",
};

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`rename-${ORG_ID}`}, 'Rename Org', ${`rename-org-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER_ID}, ${`rename-owner-${ORG_ID}`}, ${ORG_ID}, ${`owner-${ORG_ID.slice(0, 8)}@rename.example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${USER_ID}, 'owner', now(), now(), true)
  `;
  for (const [id, status] of [
    [PENDING, "needs_confirmation"],
    [READY, "complete"],
  ] as const) {
    await sql`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state,
        location_mode, location_confirmed_at, classification_status, classification, categories, audience,
        category_confirmed_at)
      VALUES (${id}, ${ORG_ID}, 'herohomeservices', ${`${id.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
        ARRAY['NSW:Yennora']::text[], 'Yennora', 'NSW', 'fixed', now(), ${status}, ${sql.json(CLASSIFICATION)},
        ${status === "complete" ? sql`ARRAY['trades_plumbing']::text[]` : sql`ARRAY[]::text[]`},
        ${status === "complete" ? "households" : null}, ${status === "complete" ? sql`now()` : null})
    `;
  }
  const { serviceDb } = await import("@/db/client");
  const { regeneratePromptPack } = await import("@/lib/prompts/regenerate-prompt-pack");
  await regeneratePromptPack(serviceDb, READY);
}, 30_000);

afterAll(async () => {
  await sql`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

async function patch(brandId: string, body: object) {
  const { PATCH } = await import("@/app/api/brands/[brandId]/route");
  return PATCH(
    new Request(`http://x/api/brands/${brandId}`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ brandId }) },
  );
}

/** The crumbs the page hands SetBreadcrumbs (the top bar reads them). */
function crumbsOf(node: ReactNode): Array<{ label: string }> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = crumbsOf(child);
      if (found) return found;
    }
    return null;
  }
  const props = (node as ReactElement<{ crumbs?: Array<{ label: string }>; children?: ReactNode }>)
    .props;
  return props?.crumbs ?? crumbsOf(props?.children);
}

describe("renaming a brand", () => {
  it("while it still needs confirmation: the name is stored, and the page's heading and breadcrumb read it", async () => {
    const res = await patch(PENDING, {
      name: "Hero Home Services",
      domain: `${PENDING.slice(0, 8)}.example.com.au`,
      vertical: "tradies",
    });
    expect(res.status).toBe(200);
    const [row] = await sql<{ name: string }[]>`SELECT name FROM brands WHERE id = ${PENDING}`;
    expect(row.name).toBe("Hero Home Services");

    const { default: Page } = await import("@/app/(auth)/brands/[brandId]/page");
    const element = await Page({ params: Promise.resolve({ brandId: PENDING }) } as never);
    expect(crumbsOf(element)?.at(-1)?.label).toBe("Hero Home Services");
    const html = renderToStaticMarkup(element as ReactElement);
    expect(html).toMatch(/<h1[^>]*>Hero Home Services<\/h1>/);
    expect(html).not.toContain(">herohomeservices<");
  });

  it("a ready brand's questions name it the new way (the pack is regenerated)", async () => {
    const pack = async () =>
      (
        await sql<{ prompt_pack: string[]; prompt_pack_version: number | null }[]>`
        SELECT prompt_pack, prompt_pack_version FROM brands WHERE id = ${READY}
      `
      )[0];
    const before = await pack();
    expect(before.prompt_pack.join("\n")).toContain("herohomeservices");
    const res = await patch(READY, {
      name: "Hero Home Services",
      domain: `${READY.slice(0, 8)}.example.com.au`,
      vertical: "tradies",
    });
    expect(res.status).toBe(200);
    const after = await pack();
    expect(after.prompt_pack.join("\n")).toContain("Is Hero Home Services a good choice");
    expect(after.prompt_pack.join("\n")).not.toContain("herohomeservices");
    expect(after.prompt_pack_version ?? 0).toBeGreaterThan(before.prompt_pack_version ?? 0);
  });

  it("a Professional services brand can save (its vertical was refused before)", async () => {
    await sql`UPDATE brands SET vertical = 'professional_services' WHERE id = ${PENDING}`;
    const res = await patch(PENDING, {
      name: "Hero Home Services",
      domain: `${PENDING.slice(0, 8)}.example.com.au`,
      vertical: "professional_services",
    });
    expect(res.status).toBe(200);
  });
});
