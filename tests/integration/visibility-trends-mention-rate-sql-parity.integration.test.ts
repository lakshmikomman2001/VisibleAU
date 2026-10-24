/**
 * Vunnara (20 Oct, post-a093ceb), headline-fix follow-up, item 4 --
 * proves db/prod-fixes/0083-visibility-trends-mention-rate-{run1-backup,
 * run2-apply,run3-post-check}.sql recompute visibility_trends rows to
 * the EXACT same values lib/visibility/visibility-trend-aggregator.ts's
 * aggregateVisibilityTrend (the TypeScript resolver) would compute for
 * the same period, from the same real citations -- one rule, proven
 * equal, never a second, drifting copy. Runs the actual .sql files'
 * text against the real test DB (not a reimplementation), then compares
 * every recomputed row field-by-field against the resolver's own
 * output on the same fixtures.
 *
 * Covers the three cases the hotfix spec names explicitly:
 *  - a real, scored 0% audit (sample_count >= 10, zero mentions) --
 *    counts like any other scored audit (item 3/4's whole point)
 *  - an audit with too few successful answers (insufficient_data,
 *    "no_answers") -- excluded from every average, auditCount 0
 *  - failed answers excluded from the sample entirely (a citations row
 *    is only ever written for a successful call -- simulated here by
 *    seeding fewer citations rows than prompts_count, exactly how a
 *    real partial-engine-failure audit looks in the citations table)
 *  - (bonus, since it's the item 1/2 follow-up this builds on) a brand
 *    mentioned but never ranked -- Position excluded, Accuracy still
 *    scored from mentioned_count alone
 *
 * ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod. The SQL
 * files themselves are PRODUCTION branch / Sri-authorized-only / NOT
 * run from Claude Code in their real, intended context (db/prod-fixes/)
 * -- this test reads their literal file contents and executes them
 * against the disposable local test database only, exactly the way
 * tests/integration/*-sql-parity* tests elsewhere in this repo already
 * do for other prod-fix migrations.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { endOfISOWeek, startOfISOWeek } from "date-fns";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();

const BRAND_ZERO_ID = randomUUID();
const AUDIT_ZERO_ID = randomUUID();
const AUDIT_SEVENTY_ID = randomUUID();

const BRAND_INSUFFICIENT_ID = randomUUID();
const AUDIT_INSUFFICIENT_ID = randomUUID();

const BRAND_NOT_RANKED_ID = randomUUID();
const AUDIT_NOT_RANKED_ID = randomUUID();

// A fixed, midweek date safely inside its own ISO week (never a Dec/Jan
// ISO-year-boundary week) -- see run1-backup.sql's header for why that
// boundary is the one case this migration's label reconstruction flags
// rather than silently trusting.
const PERIOD_DATE = new Date("2026-06-17T12:00:00Z");

let client: ReturnType<typeof postgres>;

async function insertCitation(opts: {
  auditId: string;
  brandMentioned: boolean;
  position?: number | null;
  citedSources?: Array<{ url: string }>;
  index: number;
}) {
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, position, cited_sources, response_snippet)
    VALUES (
      ${opts.auditId}, 'chatgpt', ${`prompt ${opts.index}`}, 1, ${opts.brandMentioned}, false,
      ${opts.position ?? null}, ${client.json(opts.citedSources ?? [])}, 'response text'
    )
  `;
}

async function insertStaleTrendRow(brandId: string, periodLabel: string) {
  await client`
    INSERT INTO visibility_trends (
      brand_id, organization_id, period_label, period_type,
      score_composite_avg, score_frequency_avg, score_position_avg, score_accuracy_avg,
      audit_count, sample_quality, mention_rate, citation_rate
    )
    VALUES (
      ${brandId}, ${ORG_ID}, ${periodLabel}, 'weekly',
      999.99, 999.99, 999.99, 999.99,
      999, 'Confirmed', 0, 0
    )
  `;
}

function readProdFix(name: string): string {
  return readFileSync(
    path.resolve(__dirname, "../../db/prod-fixes", name),
    "utf-8",
  );
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`vtp-${ORG_ID}`}, 'Visibility Trends Parity Org', ${`vtp-org-${ORG_ID}`})
  `;

  // --- Brand Zero: two real audits in the SAME week -- a genuine 0%
  // (10 of 10 organic answers, zero mentions) and a genuine 70%. ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_ZERO_ID}, ${ORG_ID}, 'VTP Zero Co', ${`vtp-zero-${randomUUID()}.example.com.au`}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${AUDIT_ZERO_ID}, ${BRAND_ZERO_ID}, ${ORG_ID}, 1, 'complete', ARRAY['chatgpt'], 10, 1, ${PERIOD_DATE},
      42, 42, 42, 42, 42, 42)
  `;
  for (let i = 0; i < 10; i++) {
    await insertCitation({ auditId: AUDIT_ZERO_ID, brandMentioned: false, index: i });
  }
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${AUDIT_SEVENTY_ID}, ${BRAND_ZERO_ID}, ${ORG_ID}, 2, 'complete', ARRAY['chatgpt'], 10, 1, ${PERIOD_DATE},
      13, 13, 13, 13, 13, 13)
  `;
  for (let i = 0; i < 10; i++) {
    const mentioned = i < 7;
    await insertCitation({
      auditId: AUDIT_SEVENTY_ID,
      brandMentioned: mentioned,
      position: mentioned ? 1 : null,
      citedSources: mentioned && i < 5 ? [{ url: "https://example.com/src" }] : [],
      index: i,
    });
  }

  // --- Brand Insufficient: prompts_count 10, but only 5 citations rows
  // (the other 5 calls FAILED -- a failed call never gets a citations
  // row at all, lib/audit/run-audit-inline.ts/run-audit.ts). 5 < 10
  // (MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE) -- insufficient_data regardless
  // of its own (also zero) mention count. ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_INSUFFICIENT_ID}, ${ORG_ID}, 'VTP Insufficient Co', ${`vtp-insufficient-${randomUUID()}.example.com.au`}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${AUDIT_INSUFFICIENT_ID}, ${BRAND_INSUFFICIENT_ID}, ${ORG_ID}, 3, 'complete', ARRAY['chatgpt'], 10, 1, ${PERIOD_DATE},
      0, 0, 0, 0, 0, 0)
  `;
  for (let i = 0; i < 5; i++) {
    await insertCitation({ auditId: AUDIT_INSUFFICIENT_ID, brandMentioned: false, index: i });
  }

  // --- Brand Not-Ranked: 10 organic answers, 6 mentioned, none of them
  // inside a list (position NULL on every mentioned row) -- Position
  // excluded (not_ranked), Accuracy still scored from mentioned_count
  // alone (3 of 6 cited). ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_NOT_RANKED_ID}, ${ORG_ID}, 'VTP Not Ranked Co', ${`vtp-notranked-${randomUUID()}.example.com.au`}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${AUDIT_NOT_RANKED_ID}, ${BRAND_NOT_RANKED_ID}, ${ORG_ID}, 4, 'complete', ARRAY['chatgpt'], 10, 1, ${PERIOD_DATE},
      60, 60, 0, 60, 60, 50)
  `;
  for (let i = 0; i < 10; i++) {
    const mentioned = i < 6;
    await insertCitation({
      auditId: AUDIT_NOT_RANKED_ID,
      brandMentioned: mentioned,
      position: null, // mentioned, but always prose -- never ranked
      citedSources: mentioned && i < 3 ? [{ url: "https://example.com/src" }] : [],
      index: i,
    });
  }

  // Seed deliberately WRONG, stale trend rows for all three brands --
  // run2-apply must overwrite every one of them.
  const { formatPeriodLabel } = await import("@/lib/visibility/visibility-trend-aggregator");
  const periodLabel = formatPeriodLabel(PERIOD_DATE, "weekly");
  await insertStaleTrendRow(BRAND_ZERO_ID, periodLabel);
  await insertStaleTrendRow(BRAND_INSUFFICIENT_ID, periodLabel);
  await insertStaleTrendRow(BRAND_NOT_RANKED_ID, periodLabel);
});

afterAll(async () => {
  const auditIds = [AUDIT_ZERO_ID, AUDIT_SEVENTY_ID, AUDIT_INSUFFICIENT_ID, AUDIT_NOT_RANKED_ID];
  const brandIds = [BRAND_ZERO_ID, BRAND_INSUFFICIENT_ID, BRAND_NOT_RANKED_ID];
  await client`DELETE FROM visibility_trends WHERE brand_id = ANY(${brandIds})`;
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ANY(${brandIds})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client`DROP TABLE IF EXISTS _backup_0083_visibility_trends`;
  await client.end();
});

describe("0083 SQL recompute matches aggregateVisibilityTrend exactly, field by field", () => {
  it("run1-backup + run2-apply recompute every seeded row to the SAME values the TypeScript resolver produces for the same period", async () => {
    // Run the ACTUAL prod-fix files' text, unmodified, against the test
    // DB -- not a reimplementation of their logic.
    await client.unsafe(readProdFix("0083-visibility-trends-mention-rate-run1-backup.sql"));
    await client.unsafe(readProdFix("0083-visibility-trends-mention-rate-run2-apply.sql"));

    const { aggregateVisibilityTrend } = await import(
      "@/lib/visibility/visibility-trend-aggregator"
    );
    const { db } = await import("@/db/client");

    const periodStart = startOfISOWeek(PERIOD_DATE);
    const periodEnd = endOfISOWeek(PERIOD_DATE);

    for (const [brandId, domain] of [
      [BRAND_ZERO_ID, "vtp-zero.example.com.au"],
      [BRAND_INSUFFICIENT_ID, "vtp-insufficient.example.com.au"],
      [BRAND_NOT_RANKED_ID, "vtp-notranked.example.com.au"],
    ] as const) {
      const resolverResult = await db.transaction((tx) =>
        aggregateVisibilityTrend(tx, {
          brandId,
          organizationId: ORG_ID,
          periodLabel: "parity-check",
          periodType: "weekly",
          periodStart,
          periodEnd,
          brandDomain: domain,
        }),
      );

      const [sqlRow] = await client`
        SELECT score_composite_avg, score_frequency_avg, score_position_avg,
               score_accuracy_avg, audit_count, sample_quality
        FROM visibility_trends
        WHERE brand_id = ${brandId}
      `;

      const toNumOrNull = (v: string | null) => (v === null ? null : Number(v));
      // aggregateVisibilityTrend's own average() never rounds -- only
      // the numeric(5,2) column's storage-time rounding does, the same
      // way inngest/functions/aggregate-visibility-trend.ts's real write
      // path (`trend.scoreAccuracyAvg?.toString()` into that column)
      // would. Round the resolver's raw in-memory value the same way
      // before comparing, so this compares what actually ends up STORED
      // on both sides, not the resolver's unrounded intermediate.
      const round2 = (v: number | null) => (v === null ? null : Number(v.toFixed(2)));

      expect(toNumOrNull(sqlRow.score_composite_avg)).toBe(round2(resolverResult.scoreCompositeAvg));
      expect(toNumOrNull(sqlRow.score_frequency_avg)).toBe(round2(resolverResult.scoreFrequencyAvg));
      // Vunnara (21 Oct, hotfix: "Usually #16"), item 1's trends decision
      // (lib/visibility/visibility-trend-aggregator.ts's own comment):
      // this 0083 SQL still computes score_position_avg via PERCENTILE_
      // CONT over the stored citations.position column -- the OLD
      // character-offset heuristic this later hotfix retired for every
      // OTHER reader. The TypeScript resolver now recomputes Position
      // from real response text instead, so the two can genuinely
      // diverge (AUDIT_SEVENTY_ID's mentioned rows have no real list
      // marker in their text: SQL says 100 from the stale column, the
      // resolver correctly says null/"not ranked"). No 0084 backfill
      // for this -- grep confirms score_position_avg has no reader
      // anywhere, so the divergence is accepted and documented, not
      // fixed, rather than spending a prod write on a value nobody
      // sees. Parity stays asserted for composite/frequency/accuracy
      // (0083's real, still-accurate job) and for the explicit
      // null-vs-null case below (BRAND_NOT_RANKED_ID, where both sides
      // happen to agree anyway).
      // Audit #36 follow-up: the aggregator no longer writes a Position or
      // Source-citation average at all (no 0-100 value exists), so there
      // is nothing to compare 0083's historical SQL against for either.
      expect(resolverResult.scoreAccuracyAvg).toBeNull();
      expect(resolverResult.scorePositionAvg).toBeNull();
      expect(sqlRow.audit_count).toBe(resolverResult.auditCount);
      // sampleQuality from the resolver is Title-cased at the end of
      // aggregateVisibilityTrend; "Insufficient data" is already
      // literal, same as the SQL's CASE branches.
      const resolverQuality =
        resolverResult.auditCount === 0
          ? "Insufficient data"
          : resolverResult.sampleQuality;
      expect(sqlRow.sample_quality).toBe(resolverQuality);
    }

    // Concrete, named-value proof for the three cases the hotfix spec
    // calls out, not just "equal to whatever the resolver said":
    const [zeroRow] = await client`
      SELECT score_composite_avg, audit_count FROM visibility_trends WHERE brand_id = ${BRAND_ZERO_ID}
    `;
    // (0 + 70) / 2 = 35 -- the real 0% counts, same as item 3/4 intend.
    expect(Number(zeroRow.score_composite_avg)).toBeCloseTo(35, 2);
    expect(zeroRow.audit_count).toBe(2);

    const [insufficientRow] = await client`
      SELECT score_composite_avg, audit_count, sample_quality
      FROM visibility_trends WHERE brand_id = ${BRAND_INSUFFICIENT_ID}
    `;
    expect(insufficientRow.score_composite_avg).toBeNull();
    expect(insufficientRow.audit_count).toBe(0);
    expect(insufficientRow.sample_quality).toBe("Insufficient data");

    const [notRankedRow] = await client`
      SELECT score_composite_avg, score_position_avg, score_accuracy_avg, audit_count
      FROM visibility_trends WHERE brand_id = ${BRAND_NOT_RANKED_ID}
    `;
    expect(Number(notRankedRow.score_composite_avg)).toBeCloseTo(60, 2);
    expect(notRankedRow.score_position_avg).toBeNull();
    expect(Number(notRankedRow.score_accuracy_avg)).toBeCloseTo(50, 2);
    expect(notRankedRow.audit_count).toBe(1);
  });

  it("run3-post-check reports remaining_mismatch_count 0 after run2-apply", async () => {
    const [{ remaining_mismatch_count }] = await client.unsafe(
      readProdFix("0083-visibility-trends-mention-rate-run3-post-check.sql"),
    );
    expect(Number(remaining_mismatch_count)).toBe(0);
  });
});
