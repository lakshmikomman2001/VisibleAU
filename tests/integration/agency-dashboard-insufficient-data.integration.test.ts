/**
 * Task #46 Phase 2, Part 2 (+ Vunnara 19 Oct, post-aa83b3a, "the
 * headline is the mention rate") -- real-DB render proof that the
 * Agency dashboard's "Avg Composite Score" KPI and "Top Movers" widget
 * read the live-recomputed headline (Frequency alone, never a blend),
 * and still exclude a zero-mention audit from "latest" via the
 * pre-existing sufficientMentionsExists filter (lib/audit/organic-
 * filter.ts) -- left unchanged by this task (a separate decision from
 * "stop blending the headline"; see the inline note below). ⚠️ DEV/TEST
 * DB ONLY.
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

  // Oldest real audit: 4/10 mentioned -- the headline (Frequency alone,
  // Vunnara 19 Oct post-aa83b3a) recomputes live to 40, never blended
  // with Position/Accuracy. The stored score_* columns below are
  // deliberately stale/different (40 flat, coincidentally the same
  // number here) to prove the dashboard reads the live headline, not
  // the stored column.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${OLDER_REAL_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 301, 'complete', ARRAY['chatgpt'], 5, 1, NOW() - INTERVAL '3 days',
      40, 40, 40, 40, 40, 40)
  `;
  await seedCitations(OLDER_REAL_AUDIT_ID, 10, 4);

  // Middle (= latest sufficient) real audit: 7/10 mentioned -- headline
  // recomputes live to 70, the genuine "+30.0" mover vs the audit above
  // (40), once the zero-mention audit below is skipped as "latest" (see
  // sufficientMentionsExists note below).
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${NEWER_REAL_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 302, 'complete', ARRAY['chatgpt'], 5, 1, NOW() - INTERVAL '2 days',
      70, 70, 70, 70, 70, 70)
  `;
  await seedCitations(NEWER_REAL_AUDIT_ID, 10, 7);

  // Latest audit: ZERO mentions. sufficientMentionsExists (lib/audit/
  // organic-filter.ts) still excludes it from "latest" here -- a
  // pre-existing filter this task deliberately left unchanged (it was
  // written to stop a "frequency_only"-basis composite from being
  // compared as if it were a "weighted" one; the headline is now always
  // a plain, directly-comparable percentage, so that original
  // justification no longer strictly applies, but changing audit-
  // selection SQL is a separate decision from "stop blending the
  // headline" -- flagged in the report-back for Sri to decide). If this
  // audit were instead picked as "latest", Avg Composite would show its
  // real 0.0 and Top Movers a real "-70.0" (0 vs the real 70).
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
  // Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
  // Avg Composite Score is each brand's LATEST sufficient audit's
  // live-recomputed headline (Frequency alone, never blended with
  // Position/Accuracy) -- never the stored score_composite column. With
  // one brand in this fixture, that's NEWER_REAL_AUDIT_ID's 70.0 --
  // never the zero-mention audit's 0.
  it("Avg Composite Score is the brand's latest sufficient audit's live headline (70.0), never a stored column or the zero-mention audit's 0", async () => {
    const html = await renderAgencyPage();
    expect(html).toContain("70.0");
    expect(html).not.toContain("55.0");
    expect(html).not.toContain("36.7");
  });

  it("Top Movers shows the genuine live +30.0 delta between the two real audits' recomputed headlines, never a fabricated delta involving the zero-mention audit", async () => {
    const html = await renderAgencyPage();
    expect(html).toContain("Agency Test Co");
    expect(html).toContain("+30.0");
    // The fabricated delta a naive "latest two audits" diff would show
    // (0 vs the real previous 70), never this.
    expect(html).not.toContain("-70.0");
  });
});
