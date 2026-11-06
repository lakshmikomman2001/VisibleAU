/**
 * No arbitrary "first brand" (7 Nov, Sri's decision 3) -- with two or more brands and none selected in
 * the switcher, every Overview section is either workspace-wide or asks which brand; none shows
 * whichever brand a query returned first. With one brand (the switcher shows it), they follow it.
 *
 * Brava Plumbing is inserted before Aqua Cleaning, so an unordered first row would usually be Brava.
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
let twoBrands: OverviewFixture;
let oneBrand: OverviewFixture;
let agency: OverviewFixture;

async function overview(fx: OverviewFixture): Promise<string> {
  session.organizationId = fx.orgId;
  const Page = (await import("@/app/(auth)/dashboard/page")).default;
  return renderToStaticMarkup(await Page());
}

/** The Autopilot tracker's own markup while it loads (components/domain/autopilot/action-progress-tracker.tsx). */
const TRACKER = 'class="h-36 rounded-xl animate-pulse"';

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  session.sql = async (orgId) =>
    (await client`SELECT metadata FROM organizations WHERE id = ${orgId}`)[0]?.metadata;
  session.userId = randomUUID();
  twoBrands = await seedOverviewFixture(client, {
    tier: "growth",
    brands: [{ name: "Brava Plumbing" }, { name: "Aqua Cleaning" }],
  });
  oneBrand = await seedOverviewFixture(client, {
    tier: "growth",
    brands: [{ name: "Solo Signs" }],
  });
  agency = await seedOverviewFixture(client, {
    tier: "agency",
    brands: [{ name: "Brava Plumbing" }, { name: "Aqua Cleaning" }],
  });
}, 120_000);

afterAll(async () => {
  await twoBrands?.cleanup();
  await oneBrand?.cleanup();
  await agency?.cleanup();
  await client.end();
});

describe("two brands, none selected", () => {
  it("Autopilot asks which brand, listing both, instead of one brand's progress", async () => {
    const html = await overview(twoBrands);
    expect(html).toContain("data-autopilot-picker");
    for (const name of ["Brava Plumbing", "Aqua Cleaning"]) {
      expect(html).toContain(`href="/brands/${twoBrands.brandIds[name]}/autopilot"`);
    }
    expect(html).not.toContain(TRACKER);
  }, 120_000);

  it("no per-brand persona section for either brand", async () => {
    const html = await overview(twoBrands);
    for (const name of ["Brava Plumbing", "Aqua Cleaning"]) {
      expect(html).not.toContain(`${name} Overview`);
      expect(html).not.toContain(`href="/brands/${twoBrands.brandIds[name]}/health-check"`);
    }
  }, 120_000);

  it("an agency's persona section is workspace-wide, with no brand", async () => {
    const html = await overview(agency);
    expect(html).toContain("Agency Command Centre");
    expect(html).toContain('href="/action-center"');
    expect(html).toContain("data-autopilot-picker");
  }, 120_000);

  it("the brand list API is in name order, so a picker's default isn't the row that came first", async () => {
    session.organizationId = twoBrands.orgId;
    const { GET } = await import("@/app/api/brands/route");
    const { brands } = await (await GET()).json();
    expect(brands.map((b: { name: string }) => b.name)).toEqual([
      "Aqua Cleaning",
      "Brava Plumbing",
    ]);
  }, 120_000);
});

describe("one brand: the switcher shows it, and the sections follow it", () => {
  it("Autopilot and the persona section are that brand's", async () => {
    const html = await overview(oneBrand);
    expect(html).toContain(TRACKER);
    expect(html).not.toContain("data-autopilot-picker");
    expect(html).toContain("Solo Signs Overview");
    expect(html).toContain(`href="/brands/${oneBrand.brandIds["Solo Signs"]}/health-check"`);
  }, 120_000);
});
