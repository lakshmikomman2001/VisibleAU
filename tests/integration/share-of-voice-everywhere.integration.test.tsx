/**
 * One Share of Voice (7 Nov) -- for the same audit, the Overview, the Visibility page's card (its API),
 * the wins feed, the PDF and the audit page show the same share and the same counts, because they all
 * read lib/visibility/share-of-voice.ts.
 *
 * The audit: 10 everyday answers. The brand is named and verified in 2, named but unverified in 1
 * (never counted); Rivalto Plumbing in 3, Harbourline Drains in 1. Three questions that name the brand
 * also name both competitors (never counted). So: 2 of 6 mentions = 33%; Rivalto 3 of 6 = 50%;
 * Harbourline 1 of 6 = 17%.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import { reportPeriodLabel } from "@/lib/reports/report-period";
import { type OverviewFixture, seedOverviewFixture } from "@/tests/helpers/overview-fixture";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
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

const BRAND = "Alphaline Plumbing";
let client: ReturnType<typeof postgres>;
let fx: OverviewFixture;
let brandId: string;
let auditId: string;
let auditLabel: string;

const decode = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
const textOf = (html: string) => decode(html.replace(/<[^>]+>/g, ""));

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  session.sql = async (orgId) =>
    (await client`SELECT metadata FROM organizations WHERE id = ${orgId}`)[0]?.metadata;
  session.userId = randomUUID();
  const createdAt = new Date(Date.now() - 60 * 60_000);
  fx = await seedOverviewFixture(client, {
    tier: "growth",
    brands: [
      {
        name: BRAND,
        competitors: ["Rivalto Plumbing", "Harbourline Drains"],
        audits: [
          {
            number: 36,
            createdAt,
            answers: [
              { brand: "verified", names: ["Rivalto Plumbing"] },
              { brand: "verified" },
              { brand: "unverified" },
              { names: ["Rivalto Plumbing"] },
              { names: ["Rivalto Plumbing"] },
              { names: ["Harbourline Drains"] },
              {},
              {},
              {},
              {},
              {
                branded: true,
                brand: "verified",
                names: ["Rivalto Plumbing", "Harbourline Drains"],
              },
              { branded: true, brand: "verified", names: ["Harbourline Drains"] },
              { branded: true, brand: "verified" },
            ],
          },
        ],
      },
    ],
  });
  session.organizationId = fx.orgId;
  brandId = fx.brandIds[BRAND];
  auditId = fx.auditIds[`${BRAND} #36`];
  const completedAt = new Date(createdAt.getTime() + 180_000);
  auditLabel = `Audit #36, ${formatInOrgTimezone(completedAt, undefined, "d MMM")}`;
}, 120_000);

afterAll(async () => {
  await fx?.cleanup();
  await client.end();
});

describe("the same audit, the same share of voice everywhere", () => {
  it("Overview: 33%, 2 of 6 mentions, and the audit", async () => {
    const Page = (await import("@/app/(auth)/dashboard/page")).default;
    const html = decode(renderToStaticMarkup(await Page()));
    const line = html.match(new RegExp(`<li data-sov-brand="${brandId}">([\\s\\S]*?)</li>`));
    expect(textOf(line?.[1] ?? "")).toBe(`${BRAND}33%2 of 6 mentions · ${auditLabel}`);
  }, 120_000);

  it("Visibility page card: the same counts, with each competitor's share", async () => {
    const { GET } = await import("@/app/api/brands/[brandId]/visibility/route");
    const res = await GET(new Request("http://test/api/brands/x/visibility"), {
      params: Promise.resolve({ brandId }),
    });
    const { shareOfVoice } = await res.json();
    expect(shareOfVoice.line).toMatchObject({
      share: "33%",
      detail: "2 of 6 mentions",
      audit: auditLabel,
    });
    expect(shareOfVoice).toMatchObject({ brandMentions: 2, totalMentions: 6, measured: true });
    expect(shareOfVoice.competitors).toEqual([
      { name: "Rivalto Plumbing", mentions: 3, sharePct: 50 },
      { name: "Harbourline Drains", mentions: 1, sharePct: (1 / 6) * 100 },
    ]);
  }, 120_000);

  it("wins feed: leads the competitor it out-mentions, with the same figures", async () => {
    const { db } = await import("@/db/client");
    const { getWinsFeed } = await import("@/lib/communication/wins-feed");
    const wins = (await getWinsFeed(db, brandId)).filter((w) => w.type === "competitor_down");
    expect(wins.map((w) => w.reason)).toEqual([
      "likely linked to: your share of voice (33%, 2 of 6 mentions) is above Harbourline Drains's (17%, 1 of 6)",
    ]);
  }, 120_000);

  it("PDF: the same shares and counts in the competitors section", async () => {
    const { db } = await import("@/db/client");
    const { buildReportData } = await import("@/lib/reports/report-data");
    const { ReportDocument } = await import("@/lib/communication/pdf-builder");
    const data = await buildReportData(db, {
      organizationId: fx.orgId,
      brandId,
      periodType: "weekly",
      periodLabel: reportPeriodLabel(new Date(), "weekly"),
      auditId,
    });
    expect(data?.competitors).toMatchObject({ brandMentions: 2, totalMentions: 6 });
    const text = collectPdfPages(<ReportDocument data={data!} />).flat();
    expect(text).toContain("33% · 2 of 6");
    expect(text).toContain("50% · 3 of 6");
    expect(text).toContain("17% · 1 of 6");
  }, 120_000);

  it("audit page: the competitor card's share and counts", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const html = decode(
      renderToStaticMarkup(
        await AuditPage({
          params: Promise.resolve({ auditId }),
          searchParams: Promise.resolve({}),
        }),
      ),
    );
    const text = textOf(html);
    expect(text).toContain("Share of voice: 33% · 2 of 6 mentions");
    expect(text).toContain(`Rivalto Plumbing50% · 3`);
    expect(text).toContain(`Harbourline Drains17% · 1`);
  }, 120_000);
});
