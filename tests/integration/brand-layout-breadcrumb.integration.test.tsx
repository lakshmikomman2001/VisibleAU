/**
 * 14 Nov, part 6 (Sri: /brands/[id]/reports said "Workspace / Brands / Brand / Reports") -- the brand layout
 * names the brand for every page under it, from the database, so the breadcrumb reads the brand's name
 * (components/domain/set-breadcrumb-brand.tsx; the top bar's rendering is in tests/unit/components/topbar-
 * breadcrumb-links.test.tsx). Another workspace's brand is never named. Real DB.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SetBreadcrumbBrand } from "@/components/domain/set-breadcrumb-brand";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session } = vi.hoisted(() => ({ session: { organizationId: "" } }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "layout-user",
    organizationId: session.organizationId,
    role: "owner",
    organization: { id: session.organizationId },
  })),
}));
// Who may open the brand is tested elsewhere (the layout's own check); here, what it names.
vi.mock("@/lib/governance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/governance")>()),
  assertBrandAccess: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

let client: ReturnType<typeof postgres>;
let hero: ReportFixture;
let other: ReportFixture;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  hero = await seedReportFixture(client, { brandName: "Hero Home Services", audits: [] });
  other = await seedReportFixture(client, { brandName: "Someone Else's Plumbing", audits: [] });
}, 60_000);

afterAll(async () => {
  await hero?.cleanup();
  await other?.cleanup();
  await client.end();
});

/** The layout's breadcrumb element, if it rendered one. */
async function namedBrand(brandId: string): Promise<{ id: string; name: string } | null> {
  const BrandLayout = (await import("@/app/(auth)/brands/[brandId]/layout")).default;
  const tree = await BrandLayout({ children: <p>page</p>, params: Promise.resolve({ brandId }) });
  const children = (tree.props as { children: ReactNode[] }).children;
  const crumb = children.find(
    (c): c is ReactElement<{ brand: { id: string; name: string } }> =>
      isValidElement(c) && c.type === SetBreadcrumbBrand,
  );
  return crumb ? crumb.props.brand : null;
}

describe("the brand layout names the brand for the breadcrumb", () => {
  it("its own brand, by name", async () => {
    session.organizationId = hero.orgId;
    expect(await namedBrand(hero.brandId)).toEqual({
      id: hero.brandId,
      name: "Hero Home Services",
    });
  }, 60_000);

  it("another workspace's brand: not named", async () => {
    session.organizationId = hero.orgId;
    expect(await namedBrand(other.brandId)).toBeNull();
  }, 60_000);
});
