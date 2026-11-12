/**
 * 13 Nov (Sri's walk-through, part 3) -- real DB and the real brand page: no audits renders "No audits yet"
 * cards (no placeholder), and when the audit figures fail to load the page still renders the brand, with
 * the figures' shared error and Try again instead of the whole page failing.
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
const BRAND_ID = randomUUID();
const figures = vi.hoisted(() => ({ fail: false }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-00000000f001",
    organizationId: ORG_ID,
    role: "owner",
    organization: { id: ORG_ID, name: "Figures Org", region: "au", metadata: {} },
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
vi.mock("@/lib/scoring/resolve-audit-dimensions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scoring/resolve-audit-dimensions")>();
  return {
    ...actual,
    resolveOrganicDimensions: vi.fn(
      async (...args: Parameters<typeof actual.resolveOrganicDimensions>) => {
        if (figures.fail) throw new Error("connection reset");
        return actual.resolveOrganicDimensions(...args);
      },
    ),
  };
});

let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`figures-${ORG_ID}`}, 'Figures Org', ${`figures-org-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state,
      location_mode, location_confirmed_at, classification_status)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Figures Plumbing', 'figures.example.com.au', 'tradies', 'au',
      ARRAY['NSW:Yennora']::text[], 'Yennora', 'NSW', 'fixed', now(), 'complete')
  `;
}, 30_000);

afterAll(async () => {
  await sql`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

async function renderBrandPage(): Promise<string> {
  const { default: Page } = await import("@/app/(auth)/brands/[brandId]/page");
  const element = await Page({ params: Promise.resolve({ brandId: BRAND_ID }) } as never);
  return renderToStaticMarkup(element as ReactElement).replace(/&#x27;/g, "'");
}

describe("the brand page's audit figures", () => {
  it("no audits: four 'No audits yet' cards, no placeholder", async () => {
    figures.fail = false;
    const html = await renderBrandPage();
    expect(html).toContain("data-brand-kpis");
    expect(html.match(/No audits yet/g)).toHaveLength(3);
    expect(html).not.toContain("data-brand-stats-error");
  });

  it("figures that fail to load: the brand still renders, with the error and Try again", async () => {
    figures.fail = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = await renderBrandPage();
    expect(html).toContain("Figures Plumbing");
    expect(html).toContain("data-brand-stats-error");
    expect(html).toContain("this brand's audit figures");
    expect(html).toContain("Try again");
    expect(html).not.toContain("No audits yet");
    expect(errors).toHaveBeenCalledWith(
      "[brand page] the audit figures failed to load",
      expect.objectContaining({ brandId: BRAND_ID }),
    );
    errors.mockRestore();
  });
});
