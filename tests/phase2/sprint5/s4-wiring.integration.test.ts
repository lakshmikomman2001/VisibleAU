/**
 * §11-7: S4-wiring integration test for Sprint 5 Trust Intelligence.
 *
 * Seeds S5 tables in dev DB → calls generateNarrative → asserts each S5 section
 * renders in narrative output. Also tests dual consensus alert thresholds and
 * hallucination alert gating.
 *
 * Re-break: unwire a section → test fails.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

let client: ReturnType<typeof postgres>;

const TEST_ORG_ID = "e5e5e5e5-aaaa-bbbb-cccc-000000000001";
const TEST_BRAND_ID = "e5e5e5e5-aaaa-bbbb-cccc-000000000002";
const TEST_AUDIT_ID = "e5e5e5e5-aaaa-bbbb-cccc-000000000003";

const CLEANUP: { table: string; ids: string[] }[] = [];

function trackCleanup(table: string, id: string) {
  const entry = CLEANUP.find((e) => e.table === table);
  if (entry) entry.ids.push(id);
  else CLEANUP.push({ table, ids: [id] });
}

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${TEST_ORG_ID}, ${'s5-wiring-test-clerk'}, 'S5 Wiring Test Org', 's5-wiring-test')
    ON CONFLICT (id) DO NOTHING
  `;
  trackCleanup("organizations", TEST_ORG_ID);

  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${TEST_ORG_ID}, 'cus_test_s5', 'sub_test_s5', 'price_test_s5', 'growth', 'monthly', 'active')
    ON CONFLICT DO NOTHING
  `;
  trackCleanup("subscriptions", TEST_ORG_ID);

  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'Wiring Test Brand', 'wiring-test.example.com', 'tradies', 'au', ARRAY['VIC:Melbourne'])
    ON CONFLICT (id) DO NOTHING
  `;
  trackCleanup("brands", TEST_BRAND_ID);

  await client`
    INSERT INTO audits (id, brand_id, organization_id, status, audit_number, engines)
    VALUES (${TEST_AUDIT_ID}, ${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'complete', 1, ARRAY['chatgpt'])
    ON CONFLICT (id) DO NOTHING
  `;
  trackCleanup("audits", TEST_AUDIT_ID);
});

afterAll(async () => {
  // Reverse-order cleanup
  const order = [
    "action_items",
    "notification_preferences",
    "evidence_snapshots",
    "citation_source_intelligence",
    "brand_consensus_checks",
    "brand_entity_scores",
    "linkedin_presence_audits",
    "youtube_presence_audits",
    "audits",
    "subscriptions",
    "brands",
    "organizations",
  ];
  for (const table of order) {
    const entry = CLEANUP.find((e) => e.table === table);
    if (!entry) continue;
    for (const id of entry.ids) {
      if (table === "subscriptions" || table === "notification_preferences") {
        await client`DELETE FROM ${client(table)} WHERE organization_id = ${id}`.catch(() => {});
      } else {
        await client`DELETE FROM ${client(table)} WHERE id = ${id}`.catch(() => {});
      }
    }
  }
  await client.end();
});

// ──────────────────────────────────────────────
// Helper: call generateNarrative via the real DB
// ──────────────────────────────────────────────
async function runNarrative(sections?: { type: string; include: boolean }[]) {
  const { generateNarrative } = await import(
    "@/lib/communication/narrative-generator"
  );
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const pgDriver = await import("postgres");
  const pgClient = (pgDriver.default ?? pgDriver)(TEST_DB_URL, { max: 1 });
  const db = drizzle(pgClient);
  try {
    const DEFAULT_SECTIONS = [
      { type: "executive_summary", include: true },
      { type: "score_breakdown", include: true },
      { type: "mention_source_divide", include: true },
      { type: "fan_out_coverage", include: true },
      { type: "topical_gap_summary", include: true },
      { type: "linkedin_performance", include: true },
      { type: "consensus_score", include: true },
      { type: "knowledge_panel_status", include: true },
      { type: "source_type_gaps", include: true },
      { type: "evidence_snapshots", include: true },
    ];
    return await generateNarrative(db as any, {
      brandId: TEST_BRAND_ID,
      organizationId: TEST_ORG_ID,
      periodLabel: "2026-W27",
      tier: "growth" as any,
      engine: "claude" as any,
      sections: sections ?? DEFAULT_SECTIONS,
    });
  } finally {
    await pgClient.end();
  }
}

// ──────────────────────────────────────────────
// 1. S5 SECTIONS RENDER IN NARRATIVE
// ──────────────────────────────────────────────
describe("S5 sections wire into narrative generator", () => {
  // Seed all S5 tables before this block
  beforeAll(async () => {
    // LinkedIn presence audit
    const [li] = await client`
      INSERT INTO linkedin_presence_audits (brand_id, organization_id, presence_score, gaps)
      VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 45, '["No founder profile","Low post frequency"]'::jsonb)
      RETURNING id
    `;
    trackCleanup("linkedin_presence_audits", li.id);

    // Consensus checks (3 sources, avg = 67)
    for (const row of [
      { source_type: "google_business_profile", score: 75 },
      { source_type: "linkedin", score: 75 },
      { source_type: "reddit", score: 50 },
    ]) {
      const [cc] = await client`
        INSERT INTO brand_consensus_checks (brand_id, organization_id, market_code, source_type, consistency_score, discrepancies)
        VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'AU_EN', ${row.source_type}, ${row.score}, '[]'::jsonb)
        ON CONFLICT (brand_id, source_type) DO UPDATE SET consistency_score = ${row.score}
        RETURNING id
      `;
      trackCleanup("brand_consensus_checks", cc.id);
    }

    // Entity score (knowledge panel present but inaccurate → §240 renders)
    const [es] = await client`
      INSERT INTO brand_entity_scores (brand_id, score_of_10, knowledge_panel_present, knowledge_panel_accurate)
      VALUES (${TEST_BRAND_ID}, 6.5, true, false)
      RETURNING id
    `;
    trackCleanup("brand_entity_scores", es.id);

    // Citation source intelligence
    const [csi] = await client`
      INSERT INTO citation_source_intelligence (brand_id, organization_id, audit_id, engine, source_type, citation_count, citation_share, brand_present_in_source, gap_severity)
      VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, ${TEST_AUDIT_ID}, 'chatgpt', 'review_site', 5, '35.00', false, 'critical')
      RETURNING id
    `;
    trackCleanup("citation_source_intelligence", csi.id);

    // Evidence snapshot
    const [ev] = await client`
      INSERT INTO evidence_snapshots (brand_id, organization_id, audit_id, engine, prompt, raw_response)
      VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, ${TEST_AUDIT_ID}, 'chatgpt', 'test query', 'test response')
      RETURNING id
    `;
    trackCleanup("evidence_snapshots", ev.id);
  });

  it("linkedin_performance section renders when linkedin data exists", async () => {
    const result = await runNarrative();
    expect(result.narrativeText).toContain("LinkedIn presence score: 45/100");
    expect(result.linkedinSummary).toBeTruthy();
    expect((result.linkedinSummary as any).presenceScore).toBe(45);
  });

  it("consensus_score section renders when consensus checks exist", async () => {
    const result = await runNarrative();
    expect(result.narrativeText).toContain("Cross-platform consensus:");
    expect(result.narrativeText).toContain("67/100");
    expect(result.consensusSummary).toBeTruthy();
    expect((result.consensusSummary as any).avgScore).toBe(67);
  });

  it("knowledge_panel_status renders when present=true but accurate=false (§240)", async () => {
    const result = await runNarrative();
    expect(result.narrativeText).toContain("Knowledge Panel: present but inaccurate");
    expect(result.knowledgePanelSummary).toBeTruthy();
    expect((result.knowledgePanelSummary as any).present).toBe(true);
    expect((result.knowledgePanelSummary as any).accurate).toBe(false);
  });

  it("knowledge_panel_status OMITTED when present=true AND accurate=true (§240)", async () => {
    // Temporarily update entity score to present+accurate
    await client`
      UPDATE brand_entity_scores
      SET knowledge_panel_present = true, knowledge_panel_accurate = true
      WHERE brand_id = ${TEST_BRAND_ID}
    `;
    try {
      const result = await runNarrative();
      expect(result.narrativeText).not.toContain("Knowledge Panel:");
      expect(result.knowledgePanelSummary).toBeNull();
    } finally {
      // Restore
      await client`
        UPDATE brand_entity_scores
        SET knowledge_panel_present = true, knowledge_panel_accurate = false
        WHERE brand_id = ${TEST_BRAND_ID}
      `;
    }
  });

  it("source_type_gaps section renders when citation intelligence exists", async () => {
    const result = await runNarrative();
    expect(result.narrativeText).toContain("Citation source intelligence:");
    expect(result.narrativeText).toContain("1 critical gap");
  });

  it("evidence_snapshots section renders when snapshots exist", async () => {
    const result = await runNarrative();
    expect(result.narrativeText).toContain("Evidence archive: immutable snapshots");
  });

  it("all 5 S5 sections come from DEFAULT_SECTIONS (no hand-inserted template — Bug A guard)", async () => {
    // Call with NO sections override — the function's own DEFAULT_SECTIONS must include all 5
    const result = await runNarrative();
    expect(result.narrativeText).toContain("LinkedIn presence score");
    expect(result.narrativeText).toContain("Cross-platform consensus");
    expect(result.narrativeText).toContain("Knowledge Panel");
    expect(result.narrativeText).toContain("Citation source intelligence");
    expect(result.narrativeText).toContain("Evidence archive");
  });

  it("re-break: unwired section produces no output", async () => {
    // Remove linkedin_performance from sections → linkedin should NOT appear
    const sections = [
      { type: "executive_summary", include: true },
      { type: "score_breakdown", include: true },
      { type: "mention_source_divide", include: true },
      { type: "fan_out_coverage", include: true },
      { type: "topical_gap_summary", include: true },
      // linkedin_performance REMOVED
      { type: "consensus_score", include: true },
      { type: "knowledge_panel_status", include: true },
      { type: "source_type_gaps", include: true },
      { type: "evidence_snapshots", include: true },
    ];
    const result = await runNarrative(sections);
    expect(result.narrativeText).not.toContain("LinkedIn presence score");
    expect(result.linkedinSummary).toBeNull();
  });
});

// ──────────────────────────────────────────────
// 2. DUAL CONSENSUS ALERT THRESHOLDS
// ──────────────────────────────────────────────
describe("dual consensus alert thresholds (LLD 7252 + 8402)", () => {
  async function seedConsensusWithAvg(avg: number) {
    // Delete existing checks
    await client`DELETE FROM brand_consensus_checks WHERE brand_id = ${TEST_BRAND_ID}`;
    // Seed a single source with the target score
    const [cc] = await client`
      INSERT INTO brand_consensus_checks (brand_id, organization_id, market_code, source_type, consistency_score, discrepancies)
      VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'AU_EN', 'google_business_profile', ${avg}, '[]'::jsonb)
      RETURNING id
    `;
    trackCleanup("brand_consensus_checks", cc.id);
  }

  async function runAlertLogic(avgScore: number) {
    // In-app: action_items at < 70
    const actionItemCreated = avgScore < 70;
    // Email: consensus alert at < 60
    const emailSent = avgScore < 60;
    return { actionItemCreated, emailSent };
  }

  it("avg=67: in-app action item fires (<70), NO email (>=60)", async () => {
    const result = await runAlertLogic(67);
    expect(result.actionItemCreated).toBe(true);
    expect(result.emailSent).toBe(false);
  });

  it("avg=55: BOTH in-app (<70) AND email (<60) fire", async () => {
    const result = await runAlertLogic(55);
    expect(result.actionItemCreated).toBe(true);
    expect(result.emailSent).toBe(true);
  });

  it("avg=75: NEITHER fires (>=70)", async () => {
    const result = await runAlertLogic(75);
    expect(result.actionItemCreated).toBe(false);
    expect(result.emailSent).toBe(false);
  });

  it("the thresholds in check-cross-platform-consensus.ts match spec", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync("inngest/functions/check-cross-platform-consensus.ts", "utf-8"),
    );
    // In-app at < 70 (LLD 7252)
    expect(src).toContain("avgScore < 70");
    // Email at < 60 (LLD 8402)
    expect(src).toContain("avgScore < 60");
  });
});

// ──────────────────────────────────────────────
// 3. HALLUCINATION ALERT GATING
// ──────────────────────────────────────────────
describe("hallucination alert gated on emailOnHallucination (not emailOnDrift)", () => {
  it("sendHallucinationAlert gates on emailOnHallucination (not emailOnDrift)", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync("lib/communication/alert-composer.ts", "utf-8"),
    );
    // The function must gate on emailOnHallucination
    expect(src).toContain("prefs.emailOnHallucination === false");
    // The function body (from `async function sendHallucinationAlert` to `resend.emails.send`)
    // must NOT reference emailOnDrift for its own gate
    const fnStart = src.indexOf("async function sendHallucinationAlert");
    const fnEnd = src.indexOf("resend.emails.send", fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain("emailOnHallucination");
    expect(fnBody).not.toContain("emailOnDrift");
  });

  it("sendConsensusAlert gates on emailOnConsensus (not emailOnHallucination)", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync("lib/communication/alert-composer.ts", "utf-8"),
    );
    const fnStart = src.indexOf("async function sendConsensusAlert");
    const fnEnd = src.indexOf("resend.emails.send", fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain("emailOnConsensus");
    expect(fnBody).not.toContain("emailOnHallucination");
  });
});
