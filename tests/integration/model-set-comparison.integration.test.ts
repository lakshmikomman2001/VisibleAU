/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 3 -- an audit is compared only with audits of the same
 * methodology version AND the same models: each audit's engine -> model set comes from its stored answers
 * (citations.llm_model; lib/llm/model-set.ts), with no new column. Audits with other models, and an audit a
 * provider answered with another model (lib/llm/model-drift.ts), are shown hollow and labelled, and never
 * compared: in the drift baseline, the PDF trend, the weekly trend and the wins feed. Real DB, the report
 * fixture's audits and answers.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const STARTER = {
  chatgpt: "gpt-4.1-mini",
  claude: "claude-haiku-4-5",
  gemini: "gemini-3.5-flash-lite",
  perplexity: "sonar",
};
const GROWTH = { ...STARTER, claude: "claude-sonnet-4-6" };
const BEFORE_SWITCH = { ...STARTER, gemini: "gemini-2.5-flash" };
const MENTIONS = { chatgpt: [1, 2], claude: [1], gemini: [2], perplexity: [1, 3] };
const V4 = 4;
/** Week 48 (Tue 24 Nov 2026 in Sydney) and week 49 (Tue 1 Dec). */
const WEEK_48 = "2026-11-23T23:00:00.000Z";
const WEEK_49 = "2026-11-30T23:00:00.000Z";

let client: ReturnType<typeof postgres>;
let fx: ReportFixture;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  const audit = (
    number: number,
    completedAt: string,
    models: Record<string, string>,
    answeredModels?: Record<string, string>,
  ) => ({
    number,
    completedAt,
    mentions: MENTIONS,
    methodologyVersion: V4,
    models,
    ...(answeredModels ? { answeredModels } : {}),
  });
  fx = await seedReportFixture(client, {
    audits: [
      // Gemini 2.5 Flash, before the switch.
      audit(48, WEEK_48, BEFORE_SWITCH),
      // Starter: Claude Haiku.
      audit(50, WEEK_49, STARTER),
      audit(51, "2026-12-01T23:00:00.000Z", STARTER),
      // Upgraded to Growth: Claude Sonnet.
      audit(52, "2026-12-02T23:00:00.000Z", GROWTH),
      // Growth, but Perplexity answered with another model: model drift.
      audit(53, "2026-12-03T23:00:00.000Z", GROWTH, { perplexity: "sonar-reasoning" }),
      audit(54, "2026-12-04T23:00:00.000Z", GROWTH),
    ],
  });
}, 120_000);

afterAll(async () => {
  await client`DELETE FROM visibility_trends WHERE brand_id = ${fx.brandId}`;
  await fx.cleanup();
  await client.end();
});

/** The drift baseline audit #n gets: its candidates are the brand's audits completed before it, newest first. */
async function baselineFor(n: number): Promise<{ reason: string | null; previous: number | null }> {
  const { serviceDb } = await import("@/db/client");
  const { audits } = await import("@/db/schema");
  const { and, desc, eq, lt, ne } = await import("drizzle-orm");
  const { driftBaseline } = await import("@/lib/drift/baseline");
  const { auditModels } = await import("@/lib/audit/model-drift");
  const [current] = await serviceDb.select().from(audits).where(eq(audits.id, fx.audits[n]));
  if (!current?.completedAt) throw new Error(`audit #${n} isn't complete`);
  const candidates = await serviceDb
    .select()
    .from(audits)
    .where(
      and(
        eq(audits.brandId, fx.brandId),
        ne(audits.id, current.id),
        eq(audits.status, "complete"),
        lt(audits.completedAt, current.completedAt),
      ),
    )
    .orderBy(desc(audits.completedAt))
    .limit(10);
  const models = await auditModels(serviceDb, [current.id, ...candidates.map((c) => c.id)]);
  const baseline = driftBaseline(current, candidates, models);
  const numberOf = (id: string) =>
    Number(Object.entries(fx.audits).find(([, auditId]) => auditId === id)?.[0]);
  return {
    reason: baseline.reason,
    previous: baseline.previous ? numberOf(baseline.previous.id) : null,
  };
}

describe("the drift baseline: same methodology, same models, no model drift", () => {
  it("two same-model, same-version audits are compared (Starter #51 with #50)", async () => {
    expect(await baselineFor(51)).toEqual({ reason: null, previous: 50 });
  }, 60_000);

  it("Starter -> Growth (Claude Haiku -> Sonnet) isn't compared", async () => {
    expect(await baselineFor(52)).toEqual({ reason: "models_changed", previous: null });
  }, 60_000);

  it("Gemini 2.5 Flash -> 3.5 Flash-Lite isn't compared", async () => {
    expect(await baselineFor(50)).toEqual({ reason: "models_changed", previous: null });
  }, 60_000);

  it("an audit a provider answered with another model isn't compared, either way", async () => {
    expect(await baselineFor(53)).toEqual({ reason: "model_drift", previous: null });
    // #54 passes over #53 and compares with #52.
    expect(await baselineFor(54)).toEqual({ reason: null, previous: 52 });
  }, 60_000);
});

describe("the PDF trend: other models and model drift are shown hollow, labelled, never compared", () => {
  it("based on #54 (Growth): #52 and #54 compare; the Starter, 2.5 Flash and drift audits don't", async () => {
    const { serviceDb } = await import("@/db/client");
    const { buildReportData } = await import("@/lib/reports/report-data");
    const { trendLines, trendPointHollow } = await import("@/lib/reports/report-format");
    const data = await buildReportData(serviceDb, {
      organizationId: fx.orgId,
      brandId: fx.brandId,
      periodType: "weekly",
      periodLabel: "2026-W49",
      auditId: fx.audits[54],
      now: new Date("2026-12-07T09:00:00.000Z"),
    });
    if (!data) throw new Error("no report data");

    const point = (n: number) => {
      const p = data.trend.points.find((t) => t.auditNumber === n);
      if (!p) throw new Error(`#${n} isn't on the trend`);
      return p;
    };
    expect(data.trend.points.map((p) => p.auditNumber)).toEqual([48, 50, 51, 52, 53, 54]);
    expect(data.trend.points.filter((p) => p.comparable).map((p) => p.auditNumber)).toEqual([
      52, 54,
    ]);
    expect(point(50)).toMatchObject({
      otherModels: "Claude Haiku 4.5, not Sonnet 4.6",
      modelDrift: null,
    });
    expect(point(48).otherModels).toBe(
      "Claude Haiku 4.5, not Sonnet 4.6; Gemini 2.5 Flash, not 3.5 Flash-Lite",
    );
    expect(point(53)).toMatchObject({
      otherModels: null,
      modelDrift: "Perplexity answered with sonar-reasoning instead of sonar (13 of 13 answers)",
    });
    for (const n of [48, 50, 51, 53]) expect(trendPointHollow(point(n)), `#${n}`).toBe(true);
    for (const n of [52, 54]) expect(trendPointHollow(point(n)), `#${n}`).toBe(false);

    const lines = trendLines(data);
    expect(lines).toContain(
      "Audit #48 used other models (Claude Haiku 4.5, not Sonnet 4.6; Gemini 2.5 Flash, not 3.5 Flash-Lite), so it's shown but not compared.",
    );
    expect(lines).toContain(
      "Audits #50–#51 used other models (Claude Haiku 4.5, not Sonnet 4.6), so they're shown but not compared.",
    );
    expect(lines).toContain(
      "Audit #53: Perplexity answered with sonar-reasoning instead of sonar (13 of 13 answers), so it's shown but not compared.",
    );
  }, 60_000);
});

describe("the weekly trend and the wins feed", () => {
  it("a week with Starter and Growth audits averages only the newest model set's, never a drift audit", async () => {
    const { serviceDb } = await import("@/db/client");
    const { aggregateVisibilityTrend } = await import(
      "@/lib/visibility/visibility-trend-aggregator"
    );
    // Mon 30 Nov - Sun 6 Dec 2026 in Sydney: #50, #51 (Starter), #52 (Growth), #53 (drift), #54 (Growth).
    const trend = await aggregateVisibilityTrend(serviceDb, {
      brandId: fx.brandId,
      organizationId: fx.orgId,
      periodLabel: "2026-W49",
      periodType: "weekly",
      periodStart: new Date("2026-11-29T13:00:00.000Z"),
      periodEnd: new Date("2026-12-06T12:59:59.999Z"),
      brandDomain: "unused.example.com.au",
    });
    expect(trend.methodologyVersion).toBe(V4);
    expect(trend.auditCount).toBe(2);
  }, 60_000);

  it("no 'Mention rate up' across a model change; the same rise with the same models still is", async () => {
    const { db } = await import("@/db/client");
    const { getWinsFeed } = await import("@/lib/communication/wins-feed");
    const { formatPeriodLabel } = await import("@/lib/visibility/visibility-trend-aggregator");
    const week48 = formatPeriodLabel(new Date(WEEK_48), "weekly");
    const week49 = formatPeriodLabel(new Date(WEEK_49), "weekly");
    const twoWeeks = (brandId: string, organizationId: string) => client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count,
        sample_quality, score_composite_avg, methodology_version, calculated_at)
      VALUES
        (${brandId}, ${organizationId}, ${week48}, 'weekly', 1, 'Hypothesis', 20.00, ${V4}, NOW() - INTERVAL '7 days'),
        (${brandId}, ${organizationId}, ${week49}, 'weekly', 1, 'Hypothesis', 40.00, ${V4}, NOW())
    `;
    const rises = async (brandId: string) =>
      (await db.transaction((tx) => getWinsFeed(tx, brandId))).filter(
        (w) => w.type === "visibility_up",
      ).length;

    // This brand: #48 (Gemini 2.5 Flash) in week 48, Gemini 3.5 Flash-Lite audits in week 49.
    await twoWeeks(fx.brandId, fx.orgId);
    try {
      expect(await rises(fx.brandId)).toBe(0);
    } finally {
      await client`DELETE FROM visibility_trends WHERE brand_id = ${fx.brandId}`;
    }

    // A brand whose audits used the same models in both weeks.
    const same = await seedReportFixture(client, {
      audits: [
        {
          number: 1,
          completedAt: WEEK_48,
          mentions: MENTIONS,
          methodologyVersion: V4,
          models: STARTER,
        },
        {
          number: 2,
          completedAt: WEEK_49,
          mentions: MENTIONS,
          methodologyVersion: V4,
          models: STARTER,
        },
      ],
    });
    try {
      await twoWeeks(same.brandId, same.orgId);
      expect(await rises(same.brandId)).toBe(1);
    } finally {
      await client`DELETE FROM visibility_trends WHERE brand_id = ${same.brandId}`;
      await same.cleanup();
    }
  }, 120_000);
});
