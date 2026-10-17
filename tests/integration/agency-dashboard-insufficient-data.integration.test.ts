/**
 * Task #46 Phase 2, Part 2 -- real-DB render proof that the Agency
 * dashboard's "Avg Composite Score" KPI and "Top Movers" widget exclude
 * zero-mention ("frequency_only" basis) audits from their SQL, instead
 * of blending/diffing a real-but-not-comparable composite 0 in
 * alongside genuinely "weighted" audits. ⚠️ DEV/TEST DB ONLY.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const OLDER_REAL_AUDIT_ID = randomUUID();
const NEWER_REAL_AUDIT_ID = randomUUID();
const ZERO_MENTION_AUDIT_ID = randomUUID();
const USER_ID = randomUUID();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    id: USER_ID,
    organizationId: ORG_ID,
    organization: { id: ORG_ID },
  }),
}));

let client: ReturnType<typeof postgres>;

async function seedCitations(auditId: string, sampleCount: number, mentionedCount: number) {
  for (let i = 0; i < sampleCount; i++) {
    const mentioned = i < mentionedCount;
    // Task #46 (fix: stored value contradicting its own CI), follow-up
    // #2: position/cited_sources on every mentioned row -- Position and
    // Source-citation now recompute live from these columns (not the
    // stored score_position/score_accuracy above), so a mentioned row
    // with neither would silently recompute both to 0.
    await client`
      INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, position, cited_sources, response_snippet)
      VALUES (${auditId}, 'chatgpt', ${`prompt ${i}`}, 1, ${mentioned}, false, ${mentioned ? 1 : null}, ${client.json(mentioned ? [{ url: "https://example.com/src" }] : [])}, 'response text')
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
    VALUES (${ORG_ID}, ${`adi-${ORG_ID}`}, 'Agency Dashboard Insufficient Data Org', ${`adi-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_agency_test', 'agency', 'monthly', 'active')
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Agency Test Co', 'agency-test.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;

  // Oldest real audit: 4/10 mentioned, every mentioned row has
  // position=1 + a cited source -- recomputes live to Frequency 40,
  // Position 100, Accuracy 100 -> composite (200+500+300)/13 = 76.92.
  // The stored score_* columns below are deliberately stale/different
  // (40 flat) to prove the dashboard no longer reads them.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${OLDER_REAL_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 301, 'complete', ARRAY['chatgpt'], 5, 1, NOW() - INTERVAL '3 days',
      40, 40, 40, 40, 40, 40)
  `;
  await seedCitations(OLDER_REAL_AUDIT_ID, 10, 4);

  // Middle (= latest sufficient) real audit: 7/10 mentioned, same
  // position/source treatment -- recomputes live to Frequency 70,
  // Position 100, Accuracy 100 -> composite (350+500+300)/13 = 88.46,
  // the genuine "+11.5" mover vs the audit above (76.92), once the
  // zero-mention audit below is correctly skipped as "latest".
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${NEWER_REAL_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 302, 'complete', ARRAY['chatgpt'], 5, 1, NOW() - INTERVAL '2 days',
      70, 70, 70, 70, 70, 70)
  `;
  await seedCitations(NEWER_REAL_AUDIT_ID, 10, 7);

  // Latest audit: ZERO mentions. If this were wrongly treated as the
  // brand's "latest" audit, Avg Composite would show a fabricated 0.0
  // instead of 88.5, and Top Movers would show a fabricated "-88.5" (0
  // vs the real 88.46) instead of the genuine "+11.5" between the two
  // real audits above.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${ZERO_MENTION_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 303, 'complete', ARRAY['chatgpt'], 5, 1, NOW(),
      0, 0, 0, 0, 0, 0)
  `;
  await seedCitations(ZERO_MENTION_AUDIT_ID, 10, 0);
});

afterAll(async () => {
  const auditIds = [OLDER_REAL_AUDIT_ID, NEWER_REAL_AUDIT_ID, ZERO_MENTION_AUDIT_ID];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function renderAgencyPage(): Promise<string> {
  const AgencyPage = (await import("@/app/(auth)/agency/page")).default;
  const element = await AgencyPage();
  return renderToStaticMarkup(element);
}

describe("Agency dashboard — read-time recompute, excludes zero-mention audits from Avg Composite Score and Top Movers (real DB)", () => {
  // Task #46 (fix: stored value contradicting its own CI), follow-up #2:
  // Avg Composite Score is now each brand's LATEST sufficient audit's
  // live-recomputed composite (not an average across every historical
  // qualifying audit, and never the stored score_composite column).
  // With one brand in this fixture, that's just NEWER_REAL_AUDIT_ID's
  // 88.46 -- never the stored "70", never the zero-mention audit's 0.
  it("Avg Composite Score is the brand's latest sufficient audit's live composite (88.5), never a stored column or the zero-mention audit's 0", async () => {
    const html = await renderAgencyPage();
    expect(html).toContain("88.5");
    expect(html).not.toContain("70.0");
    expect(html).not.toContain("55.0");
    expect(html).not.toContain("36.7");
  });

  it("Top Movers shows the genuine live +11.5 delta between the two real audits' recomputed composites, never a fabricated delta involving the zero-mention audit", async () => {
    const html = await renderAgencyPage();
    expect(html).toContain("Agency Test Co");
    expect(html).toContain("+11.5");
    // The fabricated delta a naive "latest two audits" diff would show
    // (0 vs the real previous 88.46), or the old stored-column deltas.
    expect(html).not.toContain("-88.5");
    expect(html).not.toContain("+30.0");
  });
});
