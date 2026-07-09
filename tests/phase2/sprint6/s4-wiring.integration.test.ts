import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
const ORG = "d4d4d4d4-0004-4000-a000-000000000001";
const BRAND = "d4d4d4d4-0004-4000-a000-000000000011";

let client: ReturnType<typeof postgres>;
let generateNarrative: any;
let narrativeDb: ReturnType<typeof postgres>;

const ALL_SECTIONS = [
  { type: "executive_summary", include: true },
  { type: "score_breakdown", include: true },
  { type: "mention_source_divide", include: true },
  { type: "fan_out_coverage", include: true },
  { type: "topical_gap_summary", include: true },
  { type: "source_type_gaps", include: true },
  { type: "agent_readiness", include: true },
  { type: "linkedin_performance", include: true },
  { type: "consensus_score", include: true },
  { type: "knowledge_panel_status", include: true },
  { type: "entity_home_status", include: true },
  { type: "evidence_snapshots", include: true },
];

async function runNarrative(sections?: { type: string; include: boolean }[]) {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const db = drizzle(narrativeDb);
  return await generateNarrative(db as any, {
    brandId: BRAND,
    organizationId: ORG,
    periodLabel: "2026-W28",
    tier: "growth" as any,
    engine: "chatgpt" as any,
    sections: sections ?? ALL_SECTIONS,
  });
}

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });
  narrativeDb = postgres(TEST_DB_URL, { max: 2 });

  const mod = await import("@/lib/communication/narrative-generator");
  generateNarrative = mod.generateNarrative;

  await client`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${ORG}, 's4w-test', 'S4W Test', 's4w-test') ON CONFLICT (id) DO NOTHING`;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG}, 'cus_s4w', 'sub_s4w', 'price_s4w', 'growth', 'monthly', 'active')
    ON CONFLICT DO NOTHING
  `;
  await client`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions) VALUES (${BRAND}, ${ORG}, 'S4W Brand', 's4w-test.example.com', 'tradies', 'au', ARRAY['VIC:Melbourne']) ON CONFLICT (id) DO NOTHING`;

  await client`
    INSERT INTO content_structure_audits (brand_id, organization_id, page_url, is_entity_home_candidate, entity_home_has_org_schema, entity_home_has_id_field, entity_home_same_as_count, entity_home_page_url)
    VALUES (${BRAND}, ${ORG}, 'https://s4w-test.example.com/about', true, true, true, 3, 'https://s4w-test.example.com/about')
    ON CONFLICT (brand_id, page_url) DO UPDATE SET
      is_entity_home_candidate = true,
      entity_home_has_org_schema = true,
      entity_home_has_id_field = true,
      entity_home_same_as_count = 3
  `;

  await client`
    INSERT INTO agent_readiness_scores (brand_id, organization_id, tech_score, entity_clarity_score, verify_score, authority_score, task_score, total_score, gaps)
    VALUES (${BRAND}, ${ORG}, 15, 12, 10, 8, 5, 50, '["Improve llms.txt depth"]'::jsonb)
  `;
}, 30000);

afterAll(async () => {
  await client`DELETE FROM agent_readiness_scores WHERE brand_id = ${BRAND}`.catch(() => {});
  await client`DELETE FROM content_structure_audits WHERE brand_id = ${BRAND}`.catch(() => {});
  await client`DELETE FROM subscriptions WHERE organization_id = ${ORG}`.catch(() => {});
  await client`DELETE FROM brands WHERE id = ${BRAND}`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${ORG}`.catch(() => {});
  await narrativeDb.end();
  await client.end();
});

describe("S6 s4-wiring — entity_home_status + agent_readiness (§0.2, Bug A + Bug B)", () => {
  it("entity_home_status renders real entity-home fields", async () => {
    const result = await runNarrative();
    expect(result.narrativeText).toContain("Entity Home:");
    expect(result.narrativeText).toContain("Organisation JSON-LD present");
    expect(result.narrativeText).toContain("@id confirmed");
    expect(result.narrativeText).toContain("sameAs declarations: 3");
    expect(result.entityHomeSummary).toBeTruthy();
    const ehs = result.entityHomeSummary as Record<string, unknown>;
    expect(ehs.orgSchemaPresent).toBe(true);
    expect(ehs.idFieldPresent).toBe(true);
    expect(ehs.sameAsCount).toBe(3);
  });

  it("agent_readiness renders score + dimensions", async () => {
    const result = await runNarrative();
    expect(result.narrativeText).toContain("Agent Readiness: 50/100");
    expect(result.narrativeText).toContain("Tech 15/20");
    expect(result.agentReadinessSummary).toBeTruthy();
    const ars = result.agentReadinessSummary as Record<string, unknown>;
    expect(ars.totalScore).toBe(50);
    expect(ars.techScore).toBe(15);
  });

  it("both sections render on DEFAULT template (Bug A guard)", async () => {
    const result = await runNarrative();
    expect(result.narrativeText).toContain("Entity Home:");
    expect(result.narrativeText).toContain("Agent Readiness:");
    expect(result.entityHomeSummary).not.toBeNull();
    expect(result.agentReadinessSummary).not.toBeNull();
  });

  it("re-break: include:false → entity_home_status not rendered", async () => {
    const sections = ALL_SECTIONS.map((s) =>
      s.type === "entity_home_status" ? { ...s, include: false } : s,
    );
    const result = await runNarrative(sections);
    expect(result.entityHomeSummary).toBeNull();
  });

  it("re-break: include:false → agent_readiness not rendered", async () => {
    const sections = ALL_SECTIONS.map((s) =>
      s.type === "agent_readiness" ? { ...s, include: false } : s,
    );
    const result = await runNarrative(sections);
    expect(result.agentReadinessSummary).toBeNull();
  });

  it("entity_home_status uses real entity-home cols, not URL heuristic (Bug B guard)", async () => {
    const result = await runNarrative();
    const ehs = result.entityHomeSummary as Record<string, unknown>;
    expect(ehs.orgSchemaPresent).toBeDefined();
    expect(ehs.idFieldPresent).toBeDefined();
    expect(ehs.sameAsCount).toBeDefined();
    expect(ehs).not.toHaveProperty("citationProbabilityScore");
    expect(ehs).not.toHaveProperty("answerCapsuleScore");
  });
});
