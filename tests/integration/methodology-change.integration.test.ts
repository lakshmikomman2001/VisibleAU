/**
 * "Mention detection" (6 Nov), part 6 -- parts 1-5 change what counts as a mention, so audits from now on
 * run under methodology version 3 ("web-grounded (v2.1)"), and a methodology change is treated like a
 * partial audit: shown, labelled "Detection improved on <date>", never compared. Real DB (migration 0124),
 * the report fixture's audits and answers.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const SAME_WEEK = (n: number) => ({
  chatgpt: [1, 2],
  claude: n % 2 ? [1] : [1, 2],
  gemini: [],
  perplexity: [1, 2, 3],
});

let client: ReturnType<typeof postgres>;
let fx: ReportFixture;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  fx = await seedReportFixture(client, {
    audits: [
      { number: 38, completedAt: "2026-10-31T22:00:00.000Z", mentions: SAME_WEEK(38) },
      { number: 39, completedAt: "2026-11-01T07:30:00.000Z", mentions: SAME_WEEK(39) },
      // The first audit under the improved detection: 7 Nov, 10:00 am AEDT.
      {
        number: 40,
        completedAt: "2026-11-06T23:00:00.000Z",
        mentions: SAME_WEEK(40),
        methodologyVersion: 3,
      },
      // The same week, still under v2 (an audit started before the change).
      { number: 41, completedAt: "2026-11-07T01:00:00.000Z", mentions: SAME_WEEK(41) },
    ],
  });
}, 120_000);

afterAll(async () => {
  await client`DELETE FROM visibility_trends WHERE brand_id = ${fx.brandId}`;
  await fx.cleanup();
  await client.end();
});

describe("the methodology version", () => {
  it("version 3 is shown as web-grounded (v2.1); new audits record version 4 (v2.2, 7 Nov)", async () => {
    const { METHODOLOGY_VERSION, methodologyLabel } = await import("@/lib/llm/methodology");
    expect(methodologyLabel(3)).toBe("web-grounded (v2.1)");
    expect(METHODOLOGY_VERSION).toBe(4);
    expect(methodologyLabel(METHODOLOGY_VERSION)).toBe("web-grounded (v2.2)");
  });
});

describe("the PDF trend shows the earlier audits, labelled, and never compares them", () => {
  it("#38 and #39 (v2) are on the chart, hollow and not comparable; #40 says when detection improved", async () => {
    const { serviceDb } = await import("@/db/client");
    const { buildReportData } = await import("@/lib/reports/report-data");
    const { trendLines } = await import("@/lib/reports/report-format");
    const data = await buildReportData(serviceDb, {
      organizationId: fx.orgId,
      brandId: fx.brandId,
      periodType: "weekly",
      periodLabel: "2026-W45",
      auditId: fx.audits[40],
      now: new Date("2026-11-09T09:00:00.000Z"),
    });
    if (!data) throw new Error("no report data");

    const byNumber = new Map(data.trend.points.map((p) => [p.auditNumber, p]));
    expect([...byNumber.keys()]).toEqual(expect.arrayContaining([38, 39, 40]));
    for (const n of [38, 39]) {
      expect(byNumber.get(n)).toMatchObject({ earlierMethodology: true, comparable: false });
    }
    expect(byNumber.get(40)).toMatchObject({
      earlierMethodology: false,
      comparable: true,
      methodologyChange: "Detection improved on 7 Nov 2026",
    });
    expect(data.trend.change).toBeNull();
    expect(trendLines(data)).toContain(
      "Detection improved on 7 Nov 2026: audits before #40 used the earlier detection, so they're shown but not compared.",
    );
  }, 60_000);
});

describe("the weekly trend and the wins feed", () => {
  it("a week with v2 and v2.1 audits averages only the v2.1 one, and records its version", async () => {
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
      brandDomain: "unused.example.com.au",
    });

    expect(trend.methodologyVersion).toBe(3);
    expect(trend.auditCount).toBe(1);
  }, 60_000);

  // Leftovers task, part 6 (17 Nov): the wins feed no longer reads visibility_trends -- its "visibility up" compares
  // the latest two audits as the audit pages count them, only when comparable. That rule (no win across a methodology,
  // model or question change) is tests/integration/wins-feed-from-audits.integration.test.ts.
});
