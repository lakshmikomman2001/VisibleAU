/**
 * 15 Nov, part 4 (Sri's review): /admin/audits listed the audits of deleted brands (Galah Plumbing, Get Plumbing,
 * hipages, plumber to the rescue) among the rest. They're now hidden unless the operator asks
 * (/admin/audits?deleted=1, "Show deleted brands' audits"), and then labelled "brand deleted"; and the page says
 * how many it lists of how many ("Showing the latest 50 of 73 complete audits"). Real DB, the real page and API.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/auth/platform-admin", () => ({
  checkPlatformAdmin: vi.fn(async () => ({ allowed: true, userId: "op-1" })),
  isPlatformAdmin: vi.fn(async () => true),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/audits",
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

let client: ReturnType<typeof postgres>;
let live: ReportFixture;
let deleted: ReportFixture;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  // The newest audits in the database, so they're among the page's latest 50.
  live = await seedReportFixture(client, {
    brandName: "Wren Home Services",
    audits: [{ number: 50, completedAt: "2026-12-31T01:00:00.000Z", mentions: { chatgpt: [1] } }],
  });
  deleted = await seedReportFixture(client, {
    brandName: "Galah Plumbing",
    audits: [{ number: 12, completedAt: "2026-12-31T02:00:00.000Z", mentions: { chatgpt: [1] } }],
  });
  await client`UPDATE brands SET deleted_at = now() WHERE id = ${deleted.brandId}`;
}, 120_000);

afterAll(async () => {
  await live?.cleanup();
  await deleted?.cleanup();
  await client.end();
});

async function counts(): Promise<{ live: number; deleted: number }> {
  const [row] = await client<{ live: number; deleted: number }[]>`
    SELECT count(*) FILTER (WHERE b.deleted_at IS NULL)::int AS live,
           count(*) FILTER (WHERE b.deleted_at IS NOT NULL)::int AS deleted
    FROM audits a JOIN brands b ON b.id = a.brand_id
    WHERE a.status = 'complete'
  `;
  return row;
}

const text = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("deleted brands' audits on /admin/audits", () => {
  it("hidden by default; the counts are the live brands' complete audits, and the deleted ones", async () => {
    const { loadTrendExclusionAdminView, RECENT_AUDITS_LISTED } = await import(
      "@/lib/admin/trend-exclusions"
    );
    const view = await loadTrendExclusionAdminView();
    const names = view.audits.map((a) => a.brandName);
    expect(names).toContain("Wren Home Services");
    expect(names).not.toContain("Galah Plumbing");
    expect(view.audits.every((a) => !a.brandDeleted)).toBe(true);
    const expected = await counts();
    expect(view.showDeletedBrands).toBe(false);
    expect(view.completeAudits).toBe(expected.live);
    expect(view.deletedBrandAudits).toBe(expected.deleted);
    expect(view.newestListed).toBe(Math.min(RECENT_AUDITS_LISTED, expected.live));
  }, 60_000);

  it("shown on request, labelled", async () => {
    const { loadTrendExclusionAdminView } = await import("@/lib/admin/trend-exclusions");
    const view = await loadTrendExclusionAdminView({ showDeletedBrands: true });
    const bondi = view.audits.find((a) => a.brandName === "Galah Plumbing");
    expect(bondi).toMatchObject({ auditNumber: 12, brandDeleted: true });
    expect(view.audits.find((a) => a.brandName === "Wren Home Services")?.brandDeleted).toBe(false);
    const expected = await counts();
    expect(view.completeAudits).toBe(expected.live + expected.deleted);
  }, 60_000);

  it("the page: hidden, with the toggle; ?deleted=1 shows them labelled; the API the same", async () => {
    const Page = (await import("@/app/(auth)/admin/audits/page")).default;
    const hidden = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(hidden).not.toContain("Galah Plumbing");
    expect(hidden).toContain("data-admin-show-deleted");
    expect(text(hidden)).toMatch(/Show deleted brands' audits \(\d+\)/);
    expect(text(hidden)).toMatch(
      /(Showing the latest \d+ of \d+ complete audits|All \d+ complete audits?)/,
    );

    const shown = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ deleted: "1" }) }),
    );
    expect(text(shown)).toContain("Galah Plumbing brand deleted");

    const { GET } = await import("@/app/api/admin/audits/route");
    const res = await GET(new Request("http://localhost/api/admin/audits?deleted=1"));
    const body = (await res.json()) as {
      audits: Array<{ brandName: string; brandDeleted: boolean }>;
    };
    expect(body.audits.find((a) => a.brandName === "Galah Plumbing")?.brandDeleted).toBe(true);
    const plain = (await (await GET(new Request("http://localhost/api/admin/audits"))).json()) as {
      audits: Array<{ brandName: string }>;
    };
    expect(plain.audits.map((a) => a.brandName)).not.toContain("Galah Plumbing");
  }, 60_000);
});
