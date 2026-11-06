/**
 * Overview (7 Nov), item 4 -- dismissing the Health Check banner is saved for that person: it stays
 * gone on their next visit (any device), a teammate still sees it, and only a brand of their own
 * workspace can be dismissed.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type OverviewFixture, seedOverviewFixture } from "@/tests/helpers/overview-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session } = vi.hoisted(() => ({
  session: {
    organizationId: "",
    userId: "",
    sql: null as null | ((orgId: string) => Promise<unknown>),
  },
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: session.userId,
    organizationId: session.organizationId,
    name: "Sam Tester",
    organization: {
      id: session.organizationId,
      metadata: await session.sql?.(session.organizationId),
    },
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

let client: ReturnType<typeof postgres>;
let workspace: OverviewFixture;
let otherWorkspace: OverviewFixture;
const sam = randomUUID();
const alex = randomUUID();

async function bannerFor(userId: string): Promise<boolean> {
  session.organizationId = workspace.orgId;
  session.userId = userId;
  const DashboardPage = (await import("@/app/(auth)/dashboard/page")).default;
  const html = renderToStaticMarkup(await DashboardPage());
  return html.includes(`data-health-check-banner="${workspace.brandIds["Foxglove Cleaning"]}"`);
}

async function dismiss(userId: string, brandId: string): Promise<Response> {
  session.organizationId = workspace.orgId;
  session.userId = userId;
  const { DELETE } = await import("@/app/api/brands/[brandId]/health-check-banner/route");
  return DELETE(new Request("http://test/api/brands/x/health-check-banner", { method: "DELETE" }), {
    params: Promise.resolve({ brandId }),
  });
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  session.sql = async (orgId) =>
    (await client`SELECT metadata FROM organizations WHERE id = ${orgId}`)[0]?.metadata;
  workspace = await seedOverviewFixture(client, {
    tier: "growth",
    brands: [{ name: "Foxglove Cleaning" }],
  });
  otherWorkspace = await seedOverviewFixture(client, {
    tier: "growth",
    brands: [{ name: "Gumtree Gardens" }],
  });
}, 120_000);

afterAll(async () => {
  await workspace?.cleanup();
  await otherWorkspace?.cleanup();
  await client.end();
});

describe("the Health Check banner's dismissal", () => {
  it("is saved for the person who dismissed it, and only them", async () => {
    expect(await bannerFor(sam)).toBe(true);

    const res = await dismiss(sam, workspace.brandIds["Foxglove Cleaning"]);
    expect(res.status).toBe(200);

    // Sam's next visit: gone. Alex, in the same workspace: still there.
    expect(await bannerFor(sam)).toBe(false);
    expect(await bannerFor(alex)).toBe(true);

    const [{ metadata }] =
      await client`SELECT metadata FROM organizations WHERE id = ${workspace.orgId}`;
    expect(Object.keys(metadata.dismissedNotices)).toEqual([
      `${sam}/health-check-banner:${workspace.brandIds["Foxglove Cleaning"]}`,
    ]);
    // Whatever else the workspace keeps there stays.
    expect(metadata.productTourComplete).toBe(true);
  }, 120_000);

  it("a brand from another workspace is not found, and nothing is saved", async () => {
    const res = await dismiss(alex, otherWorkspace.brandIds["Gumtree Gardens"]);
    expect(res.status).toBe(404);
    const [{ metadata }] =
      await client`SELECT metadata FROM organizations WHERE id = ${workspace.orgId}`;
    expect(Object.keys(metadata.dismissedNotices)).toHaveLength(1);
    expect(await bannerFor(alex)).toBe(true);
  }, 120_000);
});
