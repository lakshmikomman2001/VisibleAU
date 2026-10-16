/**
 * Task #46 Phase 2, Part 4 -- real-DB proof that aggregateVisibilityTrend
 * excludes a zero-mention ("frequency_only" basis) audit from BOTH the
 * numerator and denominator of its period averages, instead of blending
 * its real-but-not-comparable composite 0 in alongside genuinely scored
 * audits. ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
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

  // One zero-mention audit in the SAME period -- composite is a real 0
  // (frequency_only), but must not drag the period average down to
  // (80 + 90 + 0) / 3 = 56.67.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${ZERO_MENTION_AUDIT}, ${BRAND_ID}, ${ORG_ID}, 203, 'complete', ARRAY['chatgpt'], 5, 1, NOW(),
      0, 0, 0, 0, 0, 0)
  `;
  await seedCitations(ZERO_MENTION_AUDIT, 10, 0);
});

afterAll(async () => {
  const auditIds = [SUFFICIENT_AUDIT_A, SUFFICIENT_AUDIT_B, ZERO_MENTION_AUDIT];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("aggregateVisibilityTrend — excludes insufficient-data audits from period averages (real DB)", () => {
  it("scoreCompositeAvg is the mean of ONLY the sufficient audits (85.0), not deflated by the zero-mention audit's real 0", async () => {
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

    expect(result.auditCount).toBe(2);
    expect(result.scoreCompositeAvg).toBe(85);
    expect(result.scoreFrequencyAvg).toBe(85);
  });

  it("sampleQuality reflects the sufficient-audit count (2), not the raw audit count (3) that includes the zero-mention audit", async () => {
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

    // auditCount === 2 is itself the proof -- 3 real complete audits
    // exist in the period, but only 2 had sufficient mention data.
    expect(result.auditCount).toBe(2);
    expect(result.sampleQuality).not.toBe("Insufficient data");
  });

  it("a period where EVERY audit is zero-mention correctly reports Insufficient data (auditCount 0), not a misleading 0.0 average", async () => {
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
        // Narrow window around only the zero-mention audit's completedAt.
        periodStart: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
        periodEnd: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
        brandDomain: "vti-test.example.com.au",
      }),
    );

    expect(result.auditCount).toBe(0);
    expect(result.scoreCompositeAvg).toBeNull();
    expect(result.sampleQuality).toBe("Insufficient data");
  });
});
