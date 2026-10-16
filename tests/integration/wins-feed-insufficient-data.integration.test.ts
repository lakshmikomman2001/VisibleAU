/**
 * Task #46 Phase 2, Part 4 -- real-DB proof that the Wins Feed's
 * findVisibilityUp never narrates a "visibility up" win when the apparent
 * improvement is actually just "the previous period's average is NULL
 * because every audit that period had zero mentions" (visibility-trend-
 * aggregator.ts's Part 4 fix makes scoreCompositeAvg NULL, not 0, for
 * such a period -- this proves wins-feed.ts doesn't silently default
 * that NULL back to 0 and fabricate a delta). ⚠️ DEV/TEST DB ONLY.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const INSUFFICIENT_PREV_BRAND_ID = randomUUID();
const REAL_WIN_BRAND_ID = randomUUID();

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`wfi-${ORG_ID}`}, 'Wins Feed Insufficient Data Org', ${`wfi-org-${ORG_ID}`})
  `;

  // --- Brand A: previous period has NO sufficient-data average (NULL,
  // per visibility-trend-aggregator.ts's Part 4 fix), current period is
  // real at 45.0. Naively defaulting NULL to 0 would narrate a
  // fabricated "+45.0 points" win here. ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${INSUFFICIENT_PREV_BRAND_ID}, ${ORG_ID}, 'WF Insufficient Prev Co', 'wf-insufficient-prev.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality,
      score_composite_avg, calculated_at)
    VALUES (${INSUFFICIENT_PREV_BRAND_ID}, ${ORG_ID}, '2026-W01', 'weekly', 0, 'Insufficient data',
      NULL, NOW() - INTERVAL '7 days')
  `;
  await client`
    INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality,
      score_composite_avg, calculated_at)
    VALUES (${INSUFFICIENT_PREV_BRAND_ID}, ${ORG_ID}, '2026-W02', 'weekly', 3, 'Hypothesis',
      45.00, NOW())
  `;

  // --- Brand B: both periods real and sufficient, genuine improvement
  // 40.0 -> 55.0 -- a real win must still be narrated (no regression). ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${REAL_WIN_BRAND_ID}, ${ORG_ID}, 'WF Real Win Co', 'wf-real-win.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality,
      score_composite_avg, calculated_at)
    VALUES (${REAL_WIN_BRAND_ID}, ${ORG_ID}, '2026-W01', 'weekly', 3, 'Hypothesis',
      40.00, NOW() - INTERVAL '7 days')
  `;
  await client`
    INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality,
      score_composite_avg, calculated_at)
    VALUES (${REAL_WIN_BRAND_ID}, ${ORG_ID}, '2026-W02', 'weekly', 4, 'Hypothesis',
      55.00, NOW())
  `;
});

afterAll(async () => {
  await client`DELETE FROM visibility_trends WHERE brand_id = ANY(${[INSUFFICIENT_PREV_BRAND_ID, REAL_WIN_BRAND_ID]})`;
  await client`DELETE FROM brands WHERE id = ANY(${[INSUFFICIENT_PREV_BRAND_ID, REAL_WIN_BRAND_ID]})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("getWinsFeed — never fabricates a visibility_up win from a NULL (insufficient-data) prior period", () => {
  it("does not narrate a win when the previous period's average is NULL (would otherwise read as a fabricated +45.0 point rise from 0)", async () => {
    const { getWinsFeed } = await import("@/lib/communication/wins-feed");
    const { db } = await import("@/db/client");

    const wins = await db.transaction((tx) => getWinsFeed(tx, INSUFFICIENT_PREV_BRAND_ID));
    const visibilityUpWins = wins.filter((w) => w.type === "visibility_up");
    expect(visibilityUpWins).toHaveLength(0);
  });

  it("still narrates a real visibility_up win when both periods have genuine averages (no regression)", async () => {
    const { getWinsFeed } = await import("@/lib/communication/wins-feed");
    const { db } = await import("@/db/client");

    const wins = await db.transaction((tx) => getWinsFeed(tx, REAL_WIN_BRAND_ID));
    const visibilityUpWins = wins.filter((w) => w.type === "visibility_up");
    expect(visibilityUpWins).toHaveLength(1);
    expect(visibilityUpWins[0].metricDelta).toBeCloseTo(15, 1);
  });
});
