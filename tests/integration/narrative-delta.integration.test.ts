/**
 * T — the "improved by N points this period" headline must reflect a real
 * period-over-period delta (currentAvg - priorAvg), never a per-period LEVEL
 * (score_composite_avg) narrated as if it were a change. generateNarrative
 * now receives scoreCompositeDelta/hasPriorPeriod as plain input — this
 * proves the headline logic reacts correctly to each case, and that the old
 * bug (a level emitted as the delta) can't silently come back.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReportSection } from "@/lib/communication/types";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

let client: ReturnType<typeof postgres>;
let narrativeDb: ReturnType<typeof postgres>;

const TEST_ORG_ID = "f1f1f1f1-aaaa-bbbb-cccc-000000000001";
const TEST_BRAND_ID = "f1f1f1f1-aaaa-bbbb-cccc-000000000002";

const EXEC_SUMMARY_ONLY: ReportSection[] = [{ type: "executive_summary", include: true }];

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });
  narrativeDb = postgres(TEST_DB_URL, { max: 2 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${TEST_ORG_ID}, 't-narrative-delta-clerk', 'T Narrative Delta Test Org', 't-narrative-delta')
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'Narrative Delta Test Brand', 'narrative-delta-test.example.com', 'tradies', 'au', ARRAY['NSW:Sydney'])
    ON CONFLICT (id) DO NOTHING
  `;

  // One "confirmed" row (used for the baseline/improved/declined cases —
  // sample quality doesn't gate those, only whether a prior period exists)
  // and one "Hypothesis" row (for the low-confidence softening case).
  await client`
    INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, score_composite_avg, audit_count, sample_quality)
    VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, '2026-T01', 'weekly', 67.80, 2, 'Confirmed')
    ON CONFLICT (brand_id, period_label, period_type) DO UPDATE SET score_composite_avg = excluded.score_composite_avg, sample_quality = excluded.sample_quality
  `;
  await client`
    INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, score_composite_avg, audit_count, sample_quality)
    VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, '2026-T02', 'weekly', 33.90, 2, 'Hypothesis')
    ON CONFLICT (brand_id, period_label, period_type) DO UPDATE SET score_composite_avg = excluded.score_composite_avg, sample_quality = excluded.sample_quality
  `;
});

afterAll(async () => {
  await client`DELETE FROM visibility_trends WHERE brand_id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM brands WHERE id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${TEST_ORG_ID}`.catch(() => {});
  await client.end();
  await narrativeDb.end();
});

async function runNarrative(
  periodLabel: string,
  scoreCompositeDelta: number | null,
  hasPriorPeriod: boolean,
) {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { generateNarrative } = await import("@/lib/communication/narrative-generator");
  const db = drizzle(narrativeDb);
  return generateNarrative(db as never, {
    brandId: TEST_BRAND_ID,
    organizationId: TEST_ORG_ID,
    periodLabel,
    tier: "growth" as never,
    engine: "claude" as never,
    sections: EXEC_SUMMARY_ONLY,
    scoreCompositeDelta,
    hasPriorPeriod,
  });
}

describe("narrative-generator — executive_summary reflects a real delta, never a level", () => {
  it("no prior period → Baseline established, no numeric improvement claim", async () => {
    const result = await runNarrative("2026-T01", null, false);
    expect(result.narrativeText).toContain("Baseline established");
    expect(result.narrativeText).not.toMatch(/points this period/);
    expect(result.narrativeText).not.toContain("improved by");
    expect(result.narrativeText).not.toContain("declined by");
    // The level may still be stated, clearly labelled as a level.
    expect(result.narrativeText).toContain("Current visibility score: 67.8");
  });

  it("real improvement (prior 40.0, current 67.8) → improved by 27.8 points this period", async () => {
    const result = await runNarrative("2026-T01", 27.8, true);
    expect(result.narrativeText).toContain("improved by 27.8 points this period");
    expect(result.narrativeText).not.toContain("Baseline established");
  });

  it("real decline (prior 80.0, current 67.8) → declined by 12.2 points this period", async () => {
    const result = await runNarrative("2026-T01", -12.2, true);
    expect(result.narrativeText).toContain("declined by 12.2 points this period");
  });

  it("Hypothesis quality (with a prior) → softened wording, no confident numeric claim", async () => {
    const result = await runNarrative("2026-T02", 27.8, true);
    expect(result.narrativeText).toContain("Early signal");
    expect(result.narrativeText).not.toContain("improved by 27.8 points this period");
    expect(result.narrativeText).not.toContain("Baseline established");
  });

  it("regression guard: the old bug (a level emitted as the delta) cannot return", async () => {
    // score_composite_avg for period 2026-T01 is 67.80 — if the headline
    // ever narrates that LEVEL as a "points this period" delta again
    // (ignoring the real scoreCompositeDelta input entirely), this catches
    // it: a genuine 27.8-point delta must never render as "67.8 points".
    const result = await runNarrative("2026-T01", 27.8, true);
    expect(result.narrativeText).not.toContain("67.8 points this period");
    expect(result.narrativeText).toContain("27.8 points this period");
  });
});
