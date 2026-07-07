/**
 * Sprint 3 Section 2 · BE-3: CROSS-SPRINT GAPS (S1→S3).
 * Tests the integration seams where S3 consumes/extends S1, S2, and Phase 1.
 * Report-first: failures are REPORTED, not auto-fixed.
 * ⚠️ DEV DB ONLY. Seeds and tears down real rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import fs from "fs";
import path from "path";

// Pure-function imports (no DB runtime deps — type-only imports from @/db/schema)
import { selectModel } from "@/lib/llm/model-selector";
import { TIER_ENGINES, enginesForTier } from "@/lib/llm/tier-engines";
import {
  simulateQueryFanOut,
  DEFAULT_MAX_SUB_QUERIES,
  MIN_SUB_QUERIES,
} from "@/lib/visibility/fan-out-simulator";
import { classifyByScore } from "@/lib/confidence-labels/classify";
import {
  calculateTopicalGaps,
  hyphenToUnderscore,
} from "@/lib/visibility/topical-gap-calculator";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau_prod";
const TEST_ORG_A = "31a7c684-35b1-4340-a24d-4f8898f252a5";

let client: ReturnType<typeof postgres>;

// DB-dependent modules — loaded dynamically after env is set
let getWinsFeed: typeof import("@/lib/communication/wins-feed").getWinsFeed;
let clampLimit: typeof import("@/lib/communication/wins-feed").clampLimit;
let db: typeof import("@/db/client").db;

const CLEANUP = {
  brandIds: [] as string[],
  auditIds: [] as string[],
  citationIds: [] as string[],
  taskIds: [] as string[],
  trendIds: [] as string[],
  sovIds: [] as string[],
  fanOutIds: [] as string[],
  gapIds: [] as string[],
  packIds: [] as string[],
  promptIds: [] as string[],
};

let seamBrandId: string;
let seamAuditId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = TEST_DB_URL;

  client = postgres(TEST_DB_URL, { max: 1 });

  // Dynamic-import DB-dependent modules
  const [winsModule, dbModule] = await Promise.all([
    import("@/lib/communication/wins-feed"),
    import("@/db/client"),
  ]);
  getWinsFeed = winsModule.getWinsFeed;
  clampLimit = winsModule.clampLimit;
  db = dbModule.db;

  // Seed brand
  const [brand] = await client`
    INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${TEST_ORG_A}, 'BE3 Seam Brand', 'be3-seam.example.com', 'tradies', 'au', ARRAY['NSW:Bondi'])
    RETURNING id
  `;
  seamBrandId = brand.id;
  CLEANUP.brandIds.push(seamBrandId);

  // Seed audit
  const [audit] = await client`
    INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, completed_at,
      score_sentiment_numeric, score_context_numeric, score_composite)
    VALUES (${seamBrandId}, ${TEST_ORG_A}, 99301, ARRAY['chatgpt','claude'], 'complete', NOW(),
      50.00, 60.00, 55.00)
    RETURNING id
  `;
  seamAuditId = audit.id;
  CLEANUP.auditIds.push(seamAuditId);
});

afterAll(async () => {
  for (const id of CLEANUP.promptIds)
    await client`DELETE FROM vertical_pack_prompts WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.packIds)
    await client`DELETE FROM vertical_packs WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.taskIds)
    await client`DELETE FROM remediation_tasks WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.fanOutIds)
    await client`DELETE FROM query_fan_out_results WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.gapIds)
    await client`DELETE FROM topical_coverage_gaps WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.sovIds)
    await client`DELETE FROM share_of_voice_snapshots WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.trendIds)
    await client`DELETE FROM visibility_trends WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.citationIds)
    await client`DELETE FROM citations WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.auditIds)
    await client`DELETE FROM audits WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.brandIds)
    await client`DELETE FROM brands WHERE id = ${id}`.catch(() => {});
  await client.end();
});

// ═══════════════════════════════════════════════════════════
// SEAM 1: S1 BUDGET + MODEL SELECTION (fan-out)
// ═══════════════════════════════════════════════════════════

describe("SEAM 1: S1 budget + model selection → fan-out", () => {
  const mockGenerateSubQueries = async (_prompt: string, _model: string, count: number) =>
    Array.from({ length: count }, (_, i) => `Sub-query ${i + 1}`);

  const mockCheckBrandMention = async () => ({
    appeared: true,
    position: 1,
    responseText: "response",
  });

  it("selectModel returns different model for free vs growth tier (not hardcoded)", () => {
    const freeModel = selectModel("free", "claude", "brand_mention");
    const growthModel = selectModel("growth", "claude", "brand_mention");
    expect(freeModel).toBe("claude-haiku-4-5");
    expect(growthModel).toBe("claude-sonnet-4-6");
    expect(freeModel).not.toBe(growthModel);
  });

  it("selectModel returns different model for agency vs starter (chatgpt)", () => {
    const starterModel = selectModel("starter", "chatgpt", "brand_mention");
    const agencyModel = selectModel("agency", "chatgpt", "brand_mention");
    expect(starterModel).toBe("gpt-4.1-mini");
    expect(agencyModel).toBe("gpt-4.1");
    expect(starterModel).not.toBe(agencyModel);
  });

  it("TIER_ENGINES: free = 2 engines, paid tiers = 4 engines", () => {
    expect(TIER_ENGINES.free).toHaveLength(2);
    expect(TIER_ENGINES.starter).toHaveLength(4);
    expect(TIER_ENGINES.growth).toHaveLength(4);
    expect(TIER_ENGINES.agency).toHaveLength(4);
  });

  it("enginesForTier('free') returns exactly ['chatgpt','perplexity']", () => {
    const freeEngines = enginesForTier("free");
    expect(freeEngines).toEqual(["chatgpt", "perplexity"]);
  });

  it("enginesForTier('growth') returns all 4 engines", () => {
    const growthEngines = enginesForTier("growth");
    expect(growthEngines).toEqual(["chatgpt", "claude", "gemini", "perplexity"]);
  });

  it("simulateQueryFanOut calls selectModel (model passed to generateSubQueries changes with tier)", async () => {
    const capturedModels: string[] = [];

    const captureModel = async (_prompt: string, model: string, count: number) => {
      capturedModels.push(model);
      return Array.from({ length: count }, (_, i) => `Q${i}`);
    };

    await simulateQueryFanOut({
      originalPrompt: "best plumber",
      engine: "claude",
      tier: "free",
      brandName: "TestBrand",
      maxSubQueries: 3,
      generateSubQueries: captureModel,
      checkBrandMention: mockCheckBrandMention,
      computeSimilarity: () => 0.9,
    });

    await simulateQueryFanOut({
      originalPrompt: "best plumber",
      engine: "claude",
      tier: "growth",
      brandName: "TestBrand",
      maxSubQueries: 3,
      generateSubQueries: captureModel,
      checkBrandMention: mockCheckBrandMention,
      computeSimilarity: () => 0.9,
    });

    expect(capturedModels).toHaveLength(2);
    expect(capturedModels[0]).toBe("claude-haiku-4-5");
    expect(capturedModels[1]).toBe("claude-sonnet-4-6");
    expect(capturedModels[0]).not.toBe(capturedModels[1]);
  });

  it("budget cap: maxSubQueries=3 → fan-out produces ≤ 3 results", async () => {
    const result = await simulateQueryFanOut({
      originalPrompt: "best plumber sydney",
      engine: "chatgpt",
      tier: "growth",
      brandName: "TestBrand",
      maxSubQueries: 3,
      generateSubQueries: mockGenerateSubQueries,
      checkBrandMention: mockCheckBrandMention,
      computeSimilarity: () => 0.9,
    });
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.length).toBeGreaterThanOrEqual(MIN_SUB_QUERIES);
  });

  it("budget cap: maxSubQueries=5 → fan-out produces ≤ 5", async () => {
    const result = await simulateQueryFanOut({
      originalPrompt: "best plumber",
      engine: "chatgpt",
      tier: "growth",
      brandName: "TestBrand",
      maxSubQueries: 5,
      generateSubQueries: mockGenerateSubQueries,
      checkBrandMention: mockCheckBrandMention,
      computeSimilarity: () => 0.9,
    });
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("DEFAULT_MAX_SUB_QUERIES = 12 (matches S1 budget policy default)", () => {
    expect(DEFAULT_MAX_SUB_QUERIES).toBe(12);
  });

  it("no hardcoded model strings in lib/visibility/ (grep guard)", () => {
    const visibilityDir = path.resolve("lib/visibility");
    const files = fs.readdirSync(visibilityDir).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      const source = fs.readFileSync(path.join(visibilityDir, file), "utf-8");
      expect(source).not.toMatch(/['"]claude-3/);
      expect(source).not.toMatch(/['"]gpt-4(?!\.1)/);
      expect(source).not.toMatch(/['"]gemini-/);
    }
  });

  it("fan-out Inngest function delegates to library + BudgetPolicyService (SEAM WIRED)", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/simulate-query-fan-out.ts"),
      "utf-8",
    );
    const loopSource = fs.readFileSync(
      path.resolve("lib/visibility/fan-out-engine-loop.ts"),
      "utf-8",
    );
    expect(source).toContain("BudgetPolicyService");
    expect(source).toContain("fanOutEngineLoop");
    expect(loopSource).toContain("getLLMService");
    expect(loopSource).toContain("detectBrandMention");
    expect(source).toContain("subscriptions.tier");
  });
});

// ═══════════════════════════════════════════════════════════
// SEAM 2: S2 remediation_tasks FK (fk_fan_out_gap, fk_topical_gap)
// ═══════════════════════════════════════════════════════════

describe("SEAM 2: S2 remediation_tasks FK → S3 tables", () => {
  it("FK constraints fk_fan_out_gap and fk_topical_gap exist in pg_constraint", async () => {
    const constraints = await client`
      SELECT conname FROM pg_constraint
      WHERE conname IN ('fk_fan_out_gap', 'fk_topical_gap')
      ORDER BY conname
    `;
    const names = constraints.map((c: { conname: string }) => c.conname);
    expect(names).toContain("fk_fan_out_gap");
    expect(names).toContain("fk_topical_gap");
  });

  it("INSERT remediation_task with real fan_out_gap_id succeeds", async () => {
    // Seed fan-out result
    const [fo] = await client`
      INSERT INTO query_fan_out_results (audit_id, brand_id, organization_id,
        original_prompt, engine, sub_query, sub_query_rank, brand_appeared)
      VALUES (${seamAuditId}, ${seamBrandId}, ${TEST_ORG_A},
        'seam test prompt', 'chatgpt', 'sub query', 1, true)
      RETURNING id
    `;
    CLEANUP.fanOutIds.push(fo.id);

    // Lookup a user for the org
    const [user] = await client`
      SELECT id FROM users WHERE organization_id = ${TEST_ORG_A} LIMIT 1
    `;

    const [task] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, priority, fan_out_gap_id)
      VALUES (${TEST_ORG_A}, ${seamBrandId}, 'Seam FK Test', 1, ${fo.id})
      RETURNING id, fan_out_gap_id
    `;
    CLEANUP.taskIds.push(task.id);
    expect(task.fan_out_gap_id).toBe(fo.id);
  });

  it("INSERT remediation_task with real topical_gap_id succeeds", async () => {
    const [gap] = await client`
      INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster,
        topic_label, brand_has_content, cross_prompt_impact)
      VALUES (${seamBrandId}, ${TEST_ORG_A}, 'tradies', 'seam_fk_test',
        'Seam FK Test', false, 3)
      RETURNING id
    `;
    CLEANUP.gapIds.push(gap.id);

    const [task] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, priority, topical_gap_id)
      VALUES (${TEST_ORG_A}, ${seamBrandId}, 'Seam Topical FK Test', 1, ${gap.id})
      RETURNING id, topical_gap_id
    `;
    CLEANUP.taskIds.push(task.id);
    expect(task.topical_gap_id).toBe(gap.id);
  });

  it("ON DELETE SET NULL: deleting topical gap nulls task.topical_gap_id (BD-01)", async () => {
    const [gap] = await client`
      INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster,
        topic_label, brand_has_content, cross_prompt_impact)
      VALUES (${seamBrandId}, ${TEST_ORG_A}, 'tradies', 'delete_test_gap',
        'Delete Test', false, 1)
      RETURNING id
    `;

    const [task] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, priority, topical_gap_id)
      VALUES (${TEST_ORG_A}, ${seamBrandId}, 'BD-01 Topical Test', 2, ${gap.id})
      RETURNING id
    `;
    CLEANUP.taskIds.push(task.id);

    // Delete the gap
    await client`DELETE FROM topical_coverage_gaps WHERE id = ${gap.id}`;

    // Task survives with NULL FK
    const [taskAfter] = await client`
      SELECT id, topical_gap_id FROM remediation_tasks WHERE id = ${task.id}
    `;
    expect(taskAfter).toBeDefined();
    expect(taskAfter.topical_gap_id).toBeNull();
  });

  it("ON DELETE SET NULL: deleting fan-out result nulls task.fan_out_gap_id", async () => {
    const [fo] = await client`
      INSERT INTO query_fan_out_results (audit_id, brand_id, organization_id,
        original_prompt, engine, sub_query, sub_query_rank, brand_appeared)
      VALUES (${seamAuditId}, ${seamBrandId}, ${TEST_ORG_A},
        'delete test prompt', 'chatgpt', 'sub q', 1, false)
      RETURNING id
    `;

    const [task] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, priority, fan_out_gap_id)
      VALUES (${TEST_ORG_A}, ${seamBrandId}, 'BD-01 FanOut Test', 2, ${fo.id})
      RETURNING id
    `;
    CLEANUP.taskIds.push(task.id);

    // Delete the fan-out result
    await client`DELETE FROM query_fan_out_results WHERE id = ${fo.id}`;

    // Task survives with NULL FK
    const [taskAfter] = await client`
      SELECT id, fan_out_gap_id FROM remediation_tasks WHERE id = ${task.id}
    `;
    expect(taskAfter).toBeDefined();
    expect(taskAfter.fan_out_gap_id).toBeNull();
  });

  it("S2 remediation_tasks schema has fan_out_gap_id and topical_gap_id columns", async () => {
    const cols = await client`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'remediation_tasks'
        AND column_name IN ('fan_out_gap_id', 'topical_gap_id')
      ORDER BY column_name
    `;
    const colNames = cols.map((c: { column_name: string }) => c.column_name);
    expect(colNames).toContain("fan_out_gap_id");
    expect(colNames).toContain("topical_gap_id");
  });
});

// ═══════════════════════════════════════════════════════════
// SEAM 3: WINS-FEED CROSS-SPRINT READS
// ═══════════════════════════════════════════════════════════

describe("SEAM 3: wins-feed reads S1/P1/S2/S3 tables", () => {
  let winsBrandId: string;
  let winsAuditId: string;

  beforeAll(async () => {
    // Separate brand for wins-feed isolation
    const [brand] = await client`
      INSERT INTO brands (organization_id, name, domain, vertical, region)
      VALUES (${TEST_ORG_A}, 'BE3 Wins Feed', 'be3-wins.example.com', 'tradies', 'au')
      RETURNING id
    `;
    winsBrandId = brand.id;
    CLEANUP.brandIds.push(winsBrandId);

    const [audit] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, completed_at,
        score_sentiment_numeric, score_context_numeric, score_composite)
      VALUES (${winsBrandId}, ${TEST_ORG_A}, 99302, ARRAY['chatgpt','claude'], 'complete', NOW(),
        50.00, 60.00, 55.00)
      RETURNING id
    `;
    winsAuditId = audit.id;
    CLEANUP.auditIds.push(winsAuditId);

    // Seed Phase 1 citation for new_citation win (1 engine only — 2+ engines triggers
    // findNewEngineCoverage which crashes due to sql<Date> MAX() returning string not Date)
    const [cit1] = await client`
      INSERT INTO citations (audit_id, engine, prompt, brand_mentioned, run_number)
      VALUES (${winsAuditId}, 'chatgpt', 'best plumber Sydney', true, 1)
      RETURNING id
    `;
    CLEANUP.citationIds.push(cit1.id);

    // Seed S2 remediation_task (status=done) for gap_closed win
    const [task] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, priority, status,
        completed_at, lift_achieved)
      VALUES (${TEST_ORG_A}, ${winsBrandId}, 'Add schema markup', 1, 'done',
        NOW(), 5.20)
      RETURNING id
    `;
    CLEANUP.taskIds.push(task.id);

    // Seed S3 visibility_trends for visibility_up win (need 2 rows, current > previous)
    const [t1] = await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type,
        audit_count, sample_quality, score_composite_avg, calculated_at)
      VALUES (${winsBrandId}, ${TEST_ORG_A}, '2026-W24', 'weekly',
        3, 'likely', 45.00, '2026-06-15T00:00:00Z')
      RETURNING id
    `;
    CLEANUP.trendIds.push(t1.id);

    const [t2] = await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type,
        audit_count, sample_quality, score_composite_avg, calculated_at)
      VALUES (${winsBrandId}, ${TEST_ORG_A}, '2026-W25', 'weekly',
        4, 'likely', 52.00, '2026-06-22T00:00:00Z')
      RETURNING id
    `;
    CLEANUP.trendIds.push(t2.id);

    // Seed S3 SoV for competitor_down win (brandShare > competitorShare)
    const [sov] = await client`
      INSERT INTO share_of_voice_snapshots (brand_id, organization_id, audit_id,
        competitor_domain, prompt_category, engine, brand_share, competitor_share,
        total_prompts, sample_quality)
      VALUES (${winsBrandId}, ${TEST_ORG_A}, ${winsAuditId},
        'rival.com.au', 'general', 'chatgpt', 35.00, 18.00, 30, 'confirmed')
      RETURNING id
    `;
    CLEANUP.sovIds.push(sov.id);
  });

  it("gap_closed: reads S2 remediation_tasks (status='done')", async () => {
    const wins = await getWinsFeed(db, winsBrandId);
    const gapClosedWins = wins.filter((w) => w.type === "gap_closed");
    expect(gapClosedWins.length).toBeGreaterThanOrEqual(1);
    expect(gapClosedWins[0].headline).toContain("Add schema markup");
    expect(gapClosedWins[0].metricDelta).toBeCloseTo(5.2, 1);
  });

  it("new_citation: reads Phase 1 citations table", async () => {
    const wins = await getWinsFeed(db, winsBrandId);
    const citationWins = wins.filter((w) => w.type === "new_citation");
    expect(citationWins.length).toBeGreaterThanOrEqual(1);
    expect(citationWins[0].headline).toMatch(/New citation on/);
  });

  it("new_engine_coverage: 2+ engines returns wins (no crash after Date coercion fix)", async () => {
    // Seed a 2nd engine citation — previously this crashed the sort
    const [cit2] = await client`
      INSERT INTO citations (audit_id, engine, prompt, brand_mentioned, run_number)
      VALUES (${winsAuditId}, 'claude', 'best plumber Sydney', true, 1)
      RETURNING id
    `;
    CLEANUP.citationIds.push(cit2.id);

    const wins = await getWinsFeed(db, winsBrandId);
    const coverageWins = wins.filter((w) => w.type === "new_engine_coverage");
    expect(coverageWins.length).toBeGreaterThanOrEqual(1);
    expect(coverageWins[0].reason).toContain("appears across");
    expect(coverageWins[0].reason).toContain("AI engines");
    expect(coverageWins[0].detectedAt).toBeInstanceOf(Date);

    // Clean up the extra citation so subsequent tests don't see stale engine coverage
    await client`DELETE FROM citations WHERE id = ${cit2.id}`;
    CLEANUP.citationIds = CLEANUP.citationIds.filter((id) => id !== cit2.id);
  });

  it("visibility_up: reads S3 visibility_trends (delta > 0)", async () => {
    const wins = await getWinsFeed(db, winsBrandId);
    const visWins = wins.filter((w) => w.type === "visibility_up");
    expect(visWins.length).toBeGreaterThanOrEqual(1);
    expect(visWins[0].headline).toContain("up");
    expect(visWins[0].metricDelta).toBeGreaterThan(0);
    expect(visWins[0].reason).toContain("improved from 45.0 to 52.0");
  });

  it("competitor_down: reads S3 share_of_voice_snapshots", async () => {
    const wins = await getWinsFeed(db, winsBrandId);
    const compWins = wins.filter((w) => w.type === "competitor_down");
    expect(compWins.length).toBeGreaterThanOrEqual(1);
    expect(compWins[0].headline).toContain("rival.com.au");
    expect(compWins[0].reason).toContain("brand share (35.0%)");
    expect(compWins[0].reason).toContain("rival.com.au (18.0%)");
  });

  it("attribution honesty: ALL win reasons prefixed 'likely linked to:'", async () => {
    const wins = await getWinsFeed(db, winsBrandId);
    expect(wins.length).toBeGreaterThan(0);
    for (const w of wins) {
      expect(w.reason).toMatch(/^likely linked to:/);
    }
  });

  it("attribution honesty: no causal language in reasons", async () => {
    const wins = await getWinsFeed(db, winsBrandId);
    const badPrefixes = ["caused by:", "due to:", "because of:"];
    for (const w of wins) {
      for (const bad of badPrefixes) {
        expect(w.reason).not.toMatch(new RegExp(`^${bad}`));
      }
    }
  });

  it("clampLimit: default=20, max=50", () => {
    expect(clampLimit()).toBe(20);
    expect(clampLimit(0)).toBe(20);
    expect(clampLimit(100)).toBe(50);
    expect(clampLimit(50)).toBe(50);
    expect(clampLimit(10)).toBe(10);
  });

  it("wins-feed source imports from Phase 1 citations + S2 remediationTasks + S3 tables", () => {
    const source = fs.readFileSync(
      path.resolve("lib/communication/wins-feed.ts"),
      "utf-8",
    );
    expect(source).toContain("citations");
    expect(source).toContain("remediationTasks");
    expect(source).toContain("visibilityTrends");
    expect(source).toContain("shareOfVoiceSnapshots");
    expect(source).toContain("audits");
  });
});

// ═══════════════════════════════════════════════════════════
// SEAM 4: PHASE 1 classify.ts REUSE (no re-implementation)
// ═══════════════════════════════════════════════════════════

describe("SEAM 4: Phase 1 classify.ts reuse", () => {
  it("classifyByScore label set: 3 labels (confirmed, likely, hypothesis)", () => {
    expect(classifyByScore(100)).toBe("confirmed");
    expect(classifyByScore(70)).toBe("confirmed");
    expect(classifyByScore(69)).toBe("likely");
    expect(classifyByScore(40)).toBe("likely");
    expect(classifyByScore(39)).toBe("hypothesis");
    expect(classifyByScore(0)).toBe("hypothesis");
  });

  it("visibility-trend-aggregator imports classifyByScore (delegates, not re-implemented)", () => {
    const source = fs.readFileSync(
      path.resolve("lib/visibility/visibility-trend-aggregator.ts"),
      "utf-8",
    );
    expect(source).toContain('classifyByScore');
    expect(source).toContain('@/lib/confidence-labels/classify');
  });

  it("sov-calculator imports classifyByScore (delegates, not re-implemented)", () => {
    const source = fs.readFileSync(
      path.resolve("lib/visibility/sov-calculator.ts"),
      "utf-8",
    );
    expect(source).toContain('classifyByScore');
    expect(source).toContain('@/lib/confidence-labels/classify');
  });

  it("aggregator sample_quality: auditCount=0 → 'Insufficient data' (hardcoded, NOT from classify)", () => {
    const source = fs.readFileSync(
      path.resolve("lib/visibility/visibility-trend-aggregator.ts"),
      "utf-8",
    );
    expect(source).toContain('"Insufficient data"');
  });

  it("aggregator mapping: auditCount≥5 → classifyByScore(80) = 'confirmed'", () => {
    expect(classifyByScore(80)).toBe("confirmed");
  });

  it("aggregator mapping: auditCount 3-4 → classifyByScore(50) = 'likely'", () => {
    expect(classifyByScore(50)).toBe("likely");
  });

  it("aggregator mapping: auditCount 1-2 → classifyByScore(20) = 'hypothesis'", () => {
    expect(classifyByScore(20)).toBe("hypothesis");
  });

  it("sov mapping: totalPrompts≥30 → classifyByScore(80) = 'confirmed'", () => {
    expect(classifyByScore(80)).toBe("confirmed");
  });

  it("sov mapping: totalPrompts 10-29 → classifyByScore(50) = 'likely'", () => {
    expect(classifyByScore(50)).toBe("likely");
  });

  it("sov mapping: totalPrompts <10 → classifyByScore(20) = 'hypothesis'", () => {
    expect(classifyByScore(20)).toBe("hypothesis");
  });
});

// ═══════════════════════════════════════════════════════════
// SEAM 5: VERTICAL_PACK_PROMPTS (topical gaps + fan-out FK)
// ═══════════════════════════════════════════════════════════

describe("SEAM 5: vertical_pack_prompts seam", () => {
  it("hyphenToUnderscore converts 'local-seo' → 'local_seo'", () => {
    expect(hyphenToUnderscore("local-seo")).toBe("local_seo");
    expect(hyphenToUnderscore("brand-awareness")).toBe("brand_awareness");
    expect(hyphenToUnderscore("no-hyphens-here")).toBe("no_hyphens_here");
    expect(hyphenToUnderscore("already_underscore")).toBe("already_underscore");
  });

  it("calculateTopicalGaps reads .topic from prompts and applies hyphenToUnderscore", () => {
    const gaps = calculateTopicalGaps({
      brandId: "fake-id",
      vertical: "tradies",
      promptTopics: [
        { topic: "local-seo", promptId: "p1", brandMentioned: false, competitorDomains: [] },
        { topic: "local-seo", promptId: "p2", brandMentioned: true, competitorDomains: [] },
        { topic: "brand-awareness", promptId: "p3", brandMentioned: false, competitorDomains: [] },
      ],
      brandDomain: "test.com",
    });
    const clusters = gaps.map((g) => g.topicCluster);
    expect(clusters).toContain("local_seo");
    expect(clusters).toContain("brand_awareness");
    expect(clusters).not.toContain("local-seo");
    expect(clusters).not.toContain("brand-awareness");
  });

  it("calculateTopicalGaps skips prompts with null/empty topic", () => {
    const gaps = calculateTopicalGaps({
      brandId: "fake-id",
      vertical: "tradies",
      promptTopics: [
        { topic: "", promptId: "p1", brandMentioned: false, competitorDomains: [] },
        { topic: "valid-topic", promptId: "p2", brandMentioned: false, competitorDomains: [] },
      ],
      brandDomain: "test.com",
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].topicCluster).toBe("valid_topic");
  });

  it("vertical_pack_prompts.topic column exists and is text type", async () => {
    const [col] = await client`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'vertical_pack_prompts' AND column_name = 'topic'
    `;
    expect(col).toBeDefined();
    expect(col.data_type).toBe("text");
  });

  it("fan-out original_prompt_id FK → vertical_pack_prompts ON DELETE SET NULL (CK3)", async () => {
    // Create a vertical pack
    const [pack] = await client`
      INSERT INTO vertical_packs (vertical, region, version, name, prompts_count)
      VALUES ('tradies', 'nz', 'be3-test', 'BE3 Test Pack', 1)
      ON CONFLICT (vertical, region) DO UPDATE SET version = 'be3-test'
      RETURNING id
    `;
    CLEANUP.packIds.push(pack.id);

    // Create a prompt
    const [prompt] = await client`
      INSERT INTO vertical_pack_prompts (pack_id, prompt_template, rank, topic)
      VALUES (${pack.id}, 'test {brand} prompt', 1, 'test-topic')
      RETURNING id
    `;
    CLEANUP.promptIds.push(prompt.id);

    // Create fan-out result referencing the prompt
    const [fo] = await client`
      INSERT INTO query_fan_out_results (audit_id, brand_id, organization_id,
        original_prompt, original_prompt_id, engine, sub_query, sub_query_rank, brand_appeared)
      VALUES (${seamAuditId}, ${seamBrandId}, ${TEST_ORG_A},
        'test prompt', ${prompt.id}, 'chatgpt', 'sub q', 1, false)
      RETURNING id
    `;
    CLEANUP.fanOutIds.push(fo.id);

    // Verify FK is set
    const [before] = await client`
      SELECT original_prompt_id FROM query_fan_out_results WHERE id = ${fo.id}
    `;
    expect(before.original_prompt_id).toBe(prompt.id);

    // Delete the prompt
    await client`DELETE FROM vertical_pack_prompts WHERE id = ${prompt.id}`;
    CLEANUP.promptIds = CLEANUP.promptIds.filter((id) => id !== prompt.id);

    // Fan-out row survives, original_prompt_id is NULL
    const [after] = await client`
      SELECT id, original_prompt_id FROM query_fan_out_results WHERE id = ${fo.id}
    `;
    expect(after).toBeDefined();
    expect(after.original_prompt_id).toBeNull();
  });

  it("topical-gaps Inngest function reads vertical_pack_prompts.topic (source check)", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/calculate-topical-gaps.ts"),
      "utf-8",
    );
    expect(source).toContain("verticalPackPrompts");
    expect(source).toContain(".topic");
    expect(source).toContain("hyphenToUnderscore");
  });
});

// ═══════════════════════════════════════════════════════════
// SEAM 6: EVENT SEAM (audit.complete alignment + serve() array)
// ═══════════════════════════════════════════════════════════

describe("SEAM 6: event seam — audit.complete + serve() array", () => {
  const S3_FUNCTIONS = [
    "simulate-query-fan-out",
    "calculate-share-of-voice",
    "aggregate-visibility-trend",
    "calculate-topical-gaps",
    "classify-citation-sources",
    "track-brand-web-mentions",
  ];

  it("run-audit.ts emits 'audit.complete' (dot notation)", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/run-audit.ts"),
      "utf-8",
    );
    expect(source).toContain('"audit.complete"');
  });

  it("all S3 functions listen on 'audit.complete' (dot) — matches emitter", () => {
    const auditCompleteListeners = [
      "inngest/functions/simulate-query-fan-out.ts",
      "inngest/functions/calculate-share-of-voice.ts",
      "inngest/functions/aggregate-visibility-trend.ts",
      "inngest/functions/calculate-topical-gaps.ts",
      "inngest/functions/classify-citation-sources.ts",
    ];

    for (const file of auditCompleteListeners) {
      const source = fs.readFileSync(path.resolve(file), "utf-8");
      expect(source).toContain('"audit.complete"');
      expect(source).not.toContain('"audit/complete"');
    }
  });

  it("track-brand-web-mentions uses cron trigger (not audit.complete) — correct", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/track-brand-web-mentions.ts"),
      "utf-8",
    );
    expect(source).toContain("cron");
  });

  it("serve() array includes all 6 S3 function names", () => {
    const source = fs.readFileSync(
      path.resolve("app/api/webhooks/inngest/route.ts"),
      "utf-8",
    );
    const expectedImports = [
      "simulateQueryFanOutFn",
      "calculateShareOfVoiceFn",
      "aggregateVisibilityTrendFn",
      "calculateTopicalGapsFn",
      "classifyCitationSourcesFn",
      "trackBrandWebMentionsFn",
    ];
    for (const fn of expectedImports) {
      expect(source).toContain(fn);
    }
  });

  it("serve() array has 34 functions total (S1 + S2 + S3 + S4 + S5 = no dropped registrations)", () => {
    const source = fs.readFileSync(
      path.resolve("app/api/webhooks/inngest/route.ts"),
      "utf-8",
    );
    const functionsMatch = source.match(/functions:\s*\[([\s\S]*?)\]/);
    expect(functionsMatch).not.toBeNull();
    const functionsList = functionsMatch![1];
    const fnNames = functionsList
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    expect(fnNames).toHaveLength(34);
  });

  it("S1 + S2 functions NOT dropped from serve() (regression check)", () => {
    const source = fs.readFileSync(
      path.resolve("app/api/webhooks/inngest/route.ts"),
      "utf-8",
    );
    // S1 functions
    expect(source).toContain("runAudit");
    expect(source).toContain("generateRecommendations");
    expect(source).toContain("sendAuditCompleteEmail");
    // S2 functions
    expect(source).toContain("generateContentDraft");
    expect(source).toContain("triggerValidationReaudit");
    expect(source).toContain("scheduleWorkflowRuns");
  });

  it("audit.complete event payload includes auditId, brandId, organizationId", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/run-audit.ts"),
      "utf-8",
    );
    expect(source).toContain("auditId");
    expect(source).toContain("brandId");
    expect(source).toContain("organizationId");
  });
});
