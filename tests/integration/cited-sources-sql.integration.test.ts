/**
 * "Mention detection" (6 Nov), Sri's decision 1 -- the cited-only rule in SQL (lib/audit/organic-filter.ts
 * citedSourcesSql) keeps exactly what citedSourcesOf keeps, and the weekly trend's citation rate -- "AI cited
 * your site" -- no longer counts the brand's site when it only came up in a Claude search, uncited.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { citedSourcesOf } from "@/lib/audit/extract-citations";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

let client: ReturnType<typeof postgres>;
let fx: ReportFixture;
let brandDomain: string;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  fx = await seedReportFixture(client, {
    audits: [
      {
        number: 40,
        completedAt: "2026-11-06T23:00:00.000Z",
        mentions: { chatgpt: [1, 2], claude: [1], gemini: [], perplexity: [1] },
      },
    ],
  });
  const [brand] = await client<
    { domain: string }[]
  >`SELECT domain FROM brands WHERE id = ${fx.brandId}`;
  brandDomain = brand.domain;
}, 120_000);

afterAll(async () => {
  await fx.cleanup();
  await client.end();
});

describe("citedSourcesSql = citedSourcesOf", () => {
  const samples: unknown[][] = [
    [
      { domain: "a.com.au", url: "https://a.com.au" },
      { domain: "b.com.au", url: "https://b.com.au", cited: false },
    ],
    [{ domain: "a.com.au", url: "https://a.com.au", cited: true }],
    ["https://legacy.com.au"],
    [{ domain: "only.com.au", url: "https://only.com.au", cited: false }],
    [],
  ];

  it.each(samples.map((s) => [JSON.stringify(s), s]))("%s", async (_label, sample) => {
    const { citedSourcesSql } = await import("@/lib/audit/organic-filter");
    const { serviceDb } = await import("@/db/client");
    const { sql } = await import("drizzle-orm");
    const rows = await serviceDb.execute<{ kept: unknown }>(
      sql`SELECT ${citedSourcesSql(sql`${JSON.stringify(sample)}::jsonb`)} AS kept`,
    );
    expect(rows[0].kept).toEqual(citedSourcesOf(sample));
  });
});

describe("the weekly trend's citation rate counts only the brand's site cited by an answer", () => {
  async function citationRate() {
    const { serviceDb } = await import("@/db/client");
    const { aggregateVisibilityTrend } = await import(
      "@/lib/visibility/visibility-trend-aggregator"
    );
    const trend = await aggregateVisibilityTrend(serviceDb, {
      brandId: fx.brandId,
      organizationId: fx.orgId,
      periodLabel: "2026-W45",
      periodType: "weekly",
      periodStart: new Date("2026-11-02T13:00:00.000Z"),
      periodEnd: new Date("2026-11-09T12:59:59.999Z"),
      brandDomain,
    });
    return trend.citationRate;
  }

  async function setEveryAnswerSource(entry: Record<string, string | boolean>) {
    await client`
      UPDATE citations SET cited_sources = ${client.json([entry])}
      WHERE audit_id = ${fx.audits[40]}
    `;
  }

  it("the site only in Claude's search results: 0; the same site cited: counted", async () => {
    const site = { domain: brandDomain, url: `https://${brandDomain}/`, origin: "retrieved" };

    await setEveryAnswerSource({ ...site, cited: false });
    expect(await citationRate()).toBe(0);

    await setEveryAnswerSource(site);
    expect(await citationRate()).toBeGreaterThan(0);
  }, 60_000);
});
