/**
 * Task #46 Phase 2, Part 4 -- real-DB proof that aggregateVisibilityTrend
 * recomputes its period averages live from real citations, never the
 * stale stored score_* columns.
 *
 * Vunnara (20 Oct, post-a093ceb), item 4 -- REWRITTEN. This file used to
 * prove a zero-mention audit was EXCLUDED from both the numerator and
 * denominator of the period average (via the now-removed
 * sufficientMentionsExists, lib/audit/organic-filter.ts), on the theory
 * that its composite was a "frequency_only" basis, not comparable to a
 * genuine "weighted" one. That theory is gone: the headline is ALWAYS
 * the Frequency DimensionResult alone now, so a real 0% (a real sample
 * that genuinely found zero mentions) is exactly as comparable as any
 * other real measurement and must count. The only audits still excluded
 * are ones whose own sample was too small to measure a rate from at all
 * (resolveHeadline's insufficient_data/"no_answers" gate, sampleCount <
 * MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE) -- never ones gated on mention
 * count. ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const SUFFICIENT_AUDIT_A = randomUUID();
const SUFFICIENT_AUDIT_B = randomUUID();
const ZERO_MENTION_AUDIT = randomUUID();
const TOO_FEW_SAMPLES_AUDIT = randomUUID();

let client: ReturnType<typeof postgres>;

async function seedCitations(auditId: string, sampleCount: number, mentionedCount: number) {
  for (let i = 0; i < sampleCount; i++) {
    await client`
      INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
      VALUES (${auditId}, 'chatgpt', ${`prompt ${i}`}, 1, ${i < mentionedCount}, false, ${client.json([])}, 'response text')
    `;
  }
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`vti-${ORG_ID}`}, 'Visibility Trend Insufficient Data Org', ${`vti-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'VTI Test Co', 'vti-test.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;

  // Two real, sufficient audits: composite 80 and 90 -- honest mean is 85.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${SUFFICIENT_AUDIT_A}, ${BRAND_ID}, ${ORG_ID}, 201, 'complete', ARRAY['chatgpt'], 5, 1, NOW() - INTERVAL '2 days',
      80, 80, 80, 80, 80, 80)
  `;
  await seedCitations(SUFFICIENT_AUDIT_A, 10, 8);

  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${SUFFICIENT_AUDIT_B}, ${BRAND_ID}, ${ORG_ID}, 202, 'complete', ARRAY['chatgpt'], 5, 1, NOW() - INTERVAL '1 days',
      90, 90, 90, 90, 90, 90)
  `;
  await seedCitations(SUFFICIENT_AUDIT_B, 10, 9);

  // One zero-mention audit in the SAME period, with a real 10-sample
  // headline (>= MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE) -- a genuine,
  // scored 0%, which now correctly DOES pull the period average down to
  // (80 + 90 + 0) / 3 = 56.67 (Vunnara, 20 Oct post-a093ceb, item 4: a
  // real 0% is real data, never silently excluded).
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${ZERO_MENTION_AUDIT}, ${BRAND_ID}, ${ORG_ID}, 203, 'complete', ARRAY['chatgpt'], 5, 1, NOW(),
      0, 0, 0, 0, 0, 0)
  `;
  await seedCitations(ZERO_MENTION_AUDIT, 10, 0);

  // A fourth audit, in its own narrow period, whose sample (5 successful
  // answers) is genuinely too small to clear MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE
  // (10) -- this one, unlike ZERO_MENTION_AUDIT above, is correctly
  // insufficient_data/"no_answers" regardless of its own mention count.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${TOO_FEW_SAMPLES_AUDIT}, ${BRAND_ID}, ${ORG_ID}, 204, 'complete', ARRAY['chatgpt'], 5, 1, NOW() - INTERVAL '10 days',
      0, 0, 0, 0, 0, 0)
  `;
  await seedCitations(TOO_FEW_SAMPLES_AUDIT, 5, 0);
});

afterAll(async () => {
  const auditIds = [
    SUFFICIENT_AUDIT_A,
    SUFFICIENT_AUDIT_B,
    ZERO_MENTION_AUDIT,
    TOO_FEW_SAMPLES_AUDIT,
  ];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("aggregateVisibilityTrend — a real zero-mention audit counts like any other scored audit (real DB)", () => {
  it("scoreCompositeAvg is the mean of EVERY audit with a real, scored headline, including the zero-mention audit's genuine 0", async () => {
    const { aggregateVisibilityTrend } = await import(
      "@/lib/visibility/visibility-trend-aggregator"
    );
    const { db } = await import("@/db/client");

    const result = await db.transaction((tx) =>
      aggregateVisibilityTrend(tx, {
        brandId: BRAND_ID,
        organizationId: ORG_ID,
        periodLabel: "test-period",
        periodType: "weekly",
        periodStart: new Date("2020-01-01"),
        periodEnd: new Date("2099-12-31"),
        brandDomain: "vti-test.example.com.au",
      }),
    );

    // Vunnara (20 Oct, post-a093ceb), item 4: auditCount is 3 here, not
    // 2 -- SUFFICIENT_AUDIT_A/B AND ZERO_MENTION_AUDIT all have a real,
    // 10-sample headline (>= MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE).
    // TOO_FEW_SAMPLES_AUDIT (5 samples, its own period, checked below)
    // is the one genuinely excluded case, and it isn't in this window.
    expect(result.auditCount).toBe(3);
    // Task #46 (fix: stored value contradicting its own CI): scoreCompositeAvg
    // now recomputes each audit's composite from real citations (this
    // function's own earlier fix, Phase 2/4), not the stored score_composite
    // column -- this fixture's citations never set `position`/`cited_sources`,
    // so Position/Source-citation recompute to a real 0 for both audits
    // (mentionedCount > 0, so "scored", just with no position/source data
    // behind it -- not insufficient_data, which only applies at 0 mentions).
    // Vunnara (19 Oct): scoreCompositeAvg now averages each audit's live
    // HEADLINE (= Frequency DimensionResult, never a blend). Headline A =
    // 8/10 = 80, B = 9/10 = 90, zero-mention = 0/10 = 0 -> mean
    // (80 + 90 + 0) / 3 = 56.666..., identical to scoreFrequencyAvg by
    // construction -- the zero-mention audit's real 0 now correctly
    // pulls the average down, same as a real low score from any audit
    // would.
    expect(result.scoreCompositeAvg).toBeCloseTo(56.67, 1);
    expect(result.scoreFrequencyAvg).toBeCloseTo(56.67, 1);
    expect(result.scoreCompositeAvg).toBe(result.scoreFrequencyAvg);
  });

  it("sampleQuality reflects the real-headline audit count (3), including the zero-mention audit", async () => {
    const { aggregateVisibilityTrend } = await import(
      "@/lib/visibility/visibility-trend-aggregator"
    );
    const { db } = await import("@/db/client");

    const result = await db.transaction((tx) =>
      aggregateVisibilityTrend(tx, {
        brandId: BRAND_ID,
        organizationId: ORG_ID,
        periodLabel: "test-period-2",
        periodType: "weekly",
        periodStart: new Date("2020-01-01"),
        periodEnd: new Date("2099-12-31"),
        brandDomain: "vti-test.example.com.au",
      }),
    );

    // auditCount === 3 -- all 3 real complete audits in this window had
    // a real, scored headline (the zero-mention one included).
    expect(result.auditCount).toBe(3);
    expect(result.sampleQuality).not.toBe("Insufficient data");
  });

  // Vunnara (20 Oct, post-a093ceb), item 4: the ONLY audit still
  // excluded is one whose sample was too small to measure a rate from
  // at all -- never one gated on mention count. TOO_FEW_SAMPLES_AUDIT
  // (5 successful answers, its own 20-day-old period) is genuinely
  // below MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE (10), regardless of its
  // own (also zero) mention count.
  it("a period whose only audit had too few successful answers (5 of 10 needed) correctly reports Insufficient data (auditCount 0), not a misleading 0.0 average", async () => {
    const { aggregateVisibilityTrend } = await import(
      "@/lib/visibility/visibility-trend-aggregator"
    );
    const { db } = await import("@/db/client");

    const result = await db.transaction((tx) =>
      aggregateVisibilityTrend(tx, {
        brandId: BRAND_ID,
        organizationId: ORG_ID,
        periodLabel: "test-period-3",
        periodType: "weekly",
        // Narrow window around only TOO_FEW_SAMPLES_AUDIT's completedAt.
        periodStart: new Date(Date.now() - 1000 * 60 * 60 * 24 * 11), // 11 days ago
        periodEnd: new Date(Date.now() - 1000 * 60 * 60 * 24 * 9), // 9 days ago
        brandDomain: "vti-test.example.com.au",
      }),
    );

    expect(result.auditCount).toBe(0);
    expect(result.scoreCompositeAvg).toBeNull();
    expect(result.sampleQuality).toBe("Insufficient data");
  });
});
