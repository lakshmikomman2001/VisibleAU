/**
 * Task #46 Phase 2, Part 3 -- real-DB render proof that the Portfolio
 * dashboard's per-brand "Score"/"Trend" columns and org-wide "Avg Score"
 * KPI skip over a zero-mention ("frequency_only" basis) audit entirely
 * when picking "latest"/"previous", instead of showing/diffing its
 * real-but-not-comparable composite 0 as if it were a genuine score.
 * ⚠️ DEV/TEST DB ONLY.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_A_ID = randomUUID(); // has a zero-mention LATEST audit + a real older one
const BRAND_B_ID = randomUUID(); // simple single real audit (portfolio needs >= 2 brands)
const BRAND_A_OLDER_REAL_AUDIT_ID = randomUUID();
const BRAND_A_ZERO_MENTION_AUDIT_ID = randomUUID();
const BRAND_B_REAL_AUDIT_ID = randomUUID();
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
    VALUES (${ORG_ID}, ${`pdi-${ORG_ID}`}, 'Portfolio Dashboard Insufficient Data Org', ${`pdi-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_A_ID}, ${ORG_ID}, 'Portfolio Brand A', 'portfolio-a.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_B_ID}, ${ORG_ID}, 'Portfolio Brand B', 'portfolio-b.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;

  // Brand A: an older REAL audit -- 5/10 mentioned, every mentioned row
  // has position=1 + a cited source -- recomputes live to Frequency 50,
  // Position 100, Accuracy 100 -> composite (250+500+300)/13 = 80.77.
  // The stored score_* columns below are deliberately stale/different
  // (50 flat) to prove the dashboard no longer reads them.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${BRAND_A_OLDER_REAL_AUDIT_ID}, ${BRAND_A_ID}, ${ORG_ID}, 401, 'complete', ARRAY['chatgpt'], 5, 1, NOW() - INTERVAL '2 days',
      50, 50, 50, 50, 50, 50)
  `;
  await seedCitations(BRAND_A_OLDER_REAL_AUDIT_ID, 10, 5);

  // ...then a LATEST audit with ZERO mentions. If this were wrongly
  // treated as the brand's "latest score," the Score column would show
  // a fabricated "0.0" and Trend would show a fabricated drop.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${BRAND_A_ZERO_MENTION_AUDIT_ID}, ${BRAND_A_ID}, ${ORG_ID}, 402, 'complete', ARRAY['chatgpt'], 5, 1, NOW(),
      0, 0, 0, 0, 0, 0)
  `;
  await seedCitations(BRAND_A_ZERO_MENTION_AUDIT_ID, 10, 0);

  // Brand B: one simple real audit -- 6/10 mentioned, same treatment --
  // recomputes live to Frequency 60, Position 100, Accuracy 100 ->
  // composite (300+500+300)/13 = 84.62.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${BRAND_B_REAL_AUDIT_ID}, ${BRAND_B_ID}, ${ORG_ID}, 403, 'complete', ARRAY['chatgpt'], 5, 1, NOW() - INTERVAL '1 days',
      65, 65, 65, 65, 65, 65)
  `;
  await seedCitations(BRAND_B_REAL_AUDIT_ID, 10, 6);
});

afterAll(async () => {
  const auditIds = [
    BRAND_A_OLDER_REAL_AUDIT_ID,
    BRAND_A_ZERO_MENTION_AUDIT_ID,
    BRAND_B_REAL_AUDIT_ID,
  ];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ANY(${[BRAND_A_ID, BRAND_B_ID]})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function renderPortfolioPage(): Promise<string> {
  const PortfolioPage = (await import("@/app/(auth)/portfolio/page")).default;
  const element = await PortfolioPage();
  return renderToStaticMarkup(element);
}

describe("Portfolio dashboard — read-time recompute, skips zero-mention audits when picking latest/previous score (real DB)", () => {
  // Task #46 (fix: stored value contradicting its own CI), follow-up #2:
  // Score/Trend/Avg Score now come from a live, batched recompute
  // (lib/scoring/resolve-audit-dimensions.ts) over the picked latest/
  // previous audit ids, never the stored score_composite column.
  it("Brand A's Score column shows the real older audit's live composite (80.8), not the stored 50.0 or the zero-mention audit's fabricated 0.0", async () => {
    const html = await renderPortfolioPage();
    expect(html).toContain("Portfolio Brand A");
    expect(html).toContain("80.8");
    expect(html).not.toContain("50.0");
  });

  it("Brand A's Trend column shows '—' (no second sufficient audit to diff against), never a fabricated drop", async () => {
    const html = await renderPortfolioPage();
    expect(html).not.toContain("-80.8");
    expect(html).not.toContain("80.8</span> -80.8");
  });

  it("org-wide Avg Score is 82.7 (mean of the two brands' live composites 80.77 and 84.62), not the stored-column mean or a fabricated-zero mean", async () => {
    const html = await renderPortfolioPage();
    expect(html).toContain("82.7");
    expect(html).not.toContain("57.5");
    expect(html).not.toContain("32.5");
  });
});
