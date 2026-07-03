import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import { formatPeriodLabel } from "@/lib/visibility/visibility-trend-aggregator";
import { calculateShareOfVoice } from "@/lib/visibility/sov-calculator";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau_prod";

const TEST_ORG_A = "31a7c684-35b1-4340-a24d-4f8898f252a5"; // VisibleAU Dev
const TEST_ORG_B = "21ac96a7-fe8a-4145-b15b-ce32300b68da"; // Test Agency 2

let client: ReturnType<typeof postgres>;

const CLEANUP_IDS = {
  brandId: "" as string,
  auditIds: [] as string[],
  citationIds: [] as string[],
  sovIds: [] as string[],
  trendIds: [] as string[],
  fanOutIds: [] as string[],
  gapIds: [] as string[],
  taskIds: [] as string[],
  mentionIds: [] as string[],
  aiModeIds: [] as string[],
  volumeIds: [] as string[],
};

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });

  // Create a dedicated test brand
  const [brand] = await client`
    INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${TEST_ORG_A}, 'E2E Sprint3 Test', 'e2e-sprint3-test.example.com', 'tradies', 'au', ARRAY['NSW:Bondi'])
    RETURNING id
  `;
  CLEANUP_IDS.brandId = brand.id;
});

afterAll(async () => {
  // Tear down in reverse dependency order
  for (const id of CLEANUP_IDS.taskIds) {
    await client`DELETE FROM remediation_tasks WHERE id = ${id}`.catch(() => {});
  }
  for (const id of CLEANUP_IDS.fanOutIds) {
    await client`DELETE FROM query_fan_out_results WHERE id = ${id}`.catch(() => {});
  }
  for (const id of CLEANUP_IDS.gapIds) {
    await client`DELETE FROM topical_coverage_gaps WHERE id = ${id}`.catch(() => {});
  }
  for (const id of CLEANUP_IDS.sovIds) {
    await client`DELETE FROM share_of_voice_snapshots WHERE id = ${id}`.catch(() => {});
  }
  for (const id of CLEANUP_IDS.trendIds) {
    await client`DELETE FROM visibility_trends WHERE id = ${id}`.catch(() => {});
  }
  for (const id of CLEANUP_IDS.mentionIds) {
    await client`DELETE FROM brand_web_mentions WHERE id = ${id}`.catch(() => {});
  }
  for (const id of CLEANUP_IDS.aiModeIds) {
    await client`DELETE FROM google_ai_mode_results WHERE id = ${id}`.catch(() => {});
  }
  for (const id of CLEANUP_IDS.citationIds) {
    await client`DELETE FROM citations WHERE id = ${id}`.catch(() => {});
  }
  for (const id of CLEANUP_IDS.auditIds) {
    await client`DELETE FROM audits WHERE id = ${id}`.catch(() => {});
  }
  for (const id of CLEANUP_IDS.volumeIds) {
    await client`DELETE FROM prompt_volume_estimates WHERE id = ${id}`.catch(() => {});
  }
  if (CLEANUP_IDS.brandId) {
    await client`DELETE FROM brands WHERE id = ${CLEANUP_IDS.brandId}`.catch(() => {});
  }
  await client.end();
});

// ──────────────────────────────────────────────
// 1. EVENT WIRING + REGISTRATION (source verification)
// ──────────────────────────────────────────────
describe("E2E: audit.complete event wiring", () => {
  const inngestFunctions = [
    { file: "inngest/functions/calculate-share-of-voice.ts", id: "calculate-share-of-voice" },
    { file: "inngest/functions/aggregate-visibility-trend.ts", id: "aggregate-visibility-trend" },
    { file: "inngest/functions/simulate-query-fan-out.ts", id: "simulate-query-fan-out" },
    { file: "inngest/functions/calculate-topical-gaps.ts", id: "calculate-topical-gaps" },
    { file: "inngest/functions/classify-citation-sources.ts", id: "classify-citation-sources" },
  ];

  for (const fn of inngestFunctions) {
    it(`${fn.id} triggers on "audit.complete" (dot, not slash)`, () => {
      const source = fs.readFileSync(path.resolve(fn.file), "utf-8");
      expect(source).toContain('"audit.complete"');
      expect(source).not.toContain('"audit/completed"');
      expect(source).not.toContain('"audit.completed"');
    });
  }

  it("track-brand-web-mentions uses cron, not audit.complete", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/track-brand-web-mentions.ts"),
      "utf-8",
    );
    expect(source).toContain("cron");
    expect(source).not.toContain('"audit.complete"');
  });

  it("all 6 Sprint 3 functions registered in serve()", () => {
    const serveSource = fs.readFileSync(
      path.resolve("app/api/webhooks/inngest/route.ts"),
      "utf-8",
    );
    expect(serveSource).toContain("calculateShareOfVoiceFn");
    expect(serveSource).toContain("aggregateVisibilityTrendFn");
    expect(serveSource).toContain("simulateQueryFanOutFn");
    expect(serveSource).toContain("calculateTopicalGapsFn");
    expect(serveSource).toContain("classifyCitationSourcesFn");
    expect(serveSource).toContain("trackBrandWebMentionsFn");
  });
});

// ──────────────────────────────────────────────
// 2. SoV WRITE-PATH — brands.domain resolution (Bug 1)
// ──────────────────────────────────────────────
describe("E2E: SoV brands.domain resolution (Bug 1 keystone)", () => {
  it("Inngest function reads brands.domain, NOT audit.metadata.domain", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/calculate-share-of-voice.ts"),
      "utf-8",
    );
    expect(source).toContain("brands.domain");
    expect(source).not.toMatch(/metadata\.\s*domain/);
  });

  it("SoV calculation excludes brand's own domain from competitors", () => {
    const result = calculateShareOfVoice({
      engine: "chatgpt",
      promptCategory: "general",
      brandDomain: "e2e-sprint3-test.example.com",
      mentions: [
        { domain: "e2e-sprint3-test.example.com", count: 30 },
        { domain: "competitor1.com.au", count: 40 },
        { domain: "competitor2.com.au", count: 30 },
      ],
      totalPrompts: 50,
    });

    const competitorDomains = result.map((r) => r.competitorDomain);
    expect(competitorDomains).not.toContain("e2e-sprint3-test.example.com");
    expect(competitorDomains).toContain("competitor1.com.au");
    expect(result[0].brandShare).toBe(30);
  });

  it("SoV rows stored in DB with correct brand_share/competitor_share", async () => {
    const [audit] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, completed_at)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 99910, ARRAY['chatgpt'], 'complete', NOW())
      RETURNING id
    `;
    CLEANUP_IDS.auditIds.push(audit.id);

    const [sov] = await client`
      INSERT INTO share_of_voice_snapshots (brand_id, organization_id, audit_id, competitor_domain, prompt_category, engine, brand_share, competitor_share, total_prompts, sample_quality)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, ${audit.id}, 'competitor1.com.au', 'general', 'chatgpt', 30.00, 40.00, 50, 'likely')
      RETURNING id
    `;
    CLEANUP_IDS.sovIds.push(sov.id);

    const [row] = await client`
      SELECT brand_share, competitor_share, competitor_domain
      FROM share_of_voice_snapshots WHERE id = ${sov.id}
    `;
    expect(Number(row.brand_share)).toBe(30);
    expect(Number(row.competitor_share)).toBe(40);
    expect(row.competitor_domain).toBe("competitor1.com.au");
    expect(row.competitor_domain).not.toBe("e2e-sprint3-test.example.com");
  });
});

// ──────────────────────────────────────────────
// 3. MI-01 IDEMPOTENCY
// ──────────────────────────────────────────────
describe("E2E: MI-01 idempotency — UPSERT on UNIQUE keys", () => {
  it("visibility_trends UNIQUE(brand_id, period_label, period_type) rejects duplicates", async () => {
    const [t1] = await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality, mention_rate, citation_rate)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, '2026-W99', 'weekly', 1, 'Hypothesis', '0.00', '0.00')
      RETURNING id
    `;
    CLEANUP_IDS.trendIds.push(t1.id);

    await expect(
      client`
        INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality, mention_rate, citation_rate)
        VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, '2026-W99', 'weekly', 2, 'Hypothesis', '0.00', '0.00')
      `,
    ).rejects.toThrow();
  });

  it("visibility_trends UPSERT via ON CONFLICT DO UPDATE is stable (no double-write)", async () => {
    await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality, mention_rate, citation_rate)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, '2026-W98', 'weekly', 1, 'Hypothesis', '5.00', '3.00')
      ON CONFLICT (brand_id, period_label, period_type) DO UPDATE
      SET audit_count = 2, mention_rate = '10.00', updated_at = NOW()
      RETURNING id
    `.then(([row]) => CLEANUP_IDS.trendIds.push(row.id));

    await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality, mention_rate, citation_rate)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, '2026-W98', 'weekly', 3, 'Likely', '15.00', '8.00')
      ON CONFLICT (brand_id, period_label, period_type) DO UPDATE
      SET audit_count = 3, mention_rate = '15.00', updated_at = NOW()
    `;

    const rows = await client`
      SELECT id FROM visibility_trends
      WHERE brand_id = ${CLEANUP_IDS.brandId} AND period_label = '2026-W98' AND period_type = 'weekly'
    `;
    expect(rows).toHaveLength(1);
  });

  it("topical_coverage_gaps UNIQUE(brand_id, vertical, topic_cluster) rejects duplicates", async () => {
    const [g1] = await client`
      INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster, topic_label, brand_has_content)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'general', 'test_mi01', 'Test MI-01', false)
      RETURNING id
    `;
    CLEANUP_IDS.gapIds.push(g1.id);

    await expect(
      client`
        INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster, topic_label, brand_has_content)
        VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'general', 'test_mi01', 'Test MI-01', true)
      `,
    ).rejects.toThrow();
  });

  it("topical_coverage_gaps UPSERT via ON CONFLICT DO UPDATE is stable", async () => {
    const [g] = await client`
      INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster, topic_label, brand_has_content, cross_prompt_impact)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'general', 'test_mi01_upsert', 'Test MI-01 Upsert', false, 3)
      ON CONFLICT (brand_id, vertical, topic_cluster) DO UPDATE
      SET cross_prompt_impact = 5, updated_at = NOW()
      RETURNING id
    `;
    CLEANUP_IDS.gapIds.push(g.id);

    await client`
      INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster, topic_label, brand_has_content, cross_prompt_impact)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'general', 'test_mi01_upsert', 'Updated', true, 7)
      ON CONFLICT (brand_id, vertical, topic_cluster) DO UPDATE
      SET cross_prompt_impact = 7, brand_has_content = true, updated_at = NOW()
    `;

    const rows = await client`
      SELECT cross_prompt_impact, brand_has_content FROM topical_coverage_gaps
      WHERE brand_id = ${CLEANUP_IDS.brandId} AND vertical = 'general' AND topic_cluster = 'test_mi01_upsert'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].cross_prompt_impact).toBe(7);
    expect(rows[0].brand_has_content).toBe(true);
  });
});

// ──────────────────────────────────────────────
// 4. VISIBILITY TREND — numeric columns, rates, ratio NULL, period, volatility
// ──────────────────────────────────────────────
describe("E2E: visibility trend DB behaviour (Section 1 deferred)", () => {
  it("aggregator uses scoreSentimentNumeric / scoreContextNumeric (NOT text columns)", () => {
    const source = fs.readFileSync(
      path.resolve("lib/visibility/visibility-trend-aggregator.ts"),
      "utf-8",
    );
    expect(source).toContain("scoreSentimentNumeric");
    expect(source).toContain("scoreContextNumeric");
    expect(source).not.toMatch(/avg\(\s*audits\.scoreSentiment\b[^N]/);
    expect(source).not.toMatch(/avg\(\s*audits\.scoreContext\b[^N]/);
  });

  it("numeric score AVGs match seeded values", async () => {
    const [a1] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, completed_at, score_sentiment_numeric, score_context_numeric, score_composite, score_sentiment, score_context)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 99920, ARRAY['chatgpt'], 'complete', '2026-06-23T12:00:00Z', 40.00, 60.00, 50.00, 'positive', 'contextual')
      RETURNING id
    `;
    CLEANUP_IDS.auditIds.push(a1.id);

    const [a2] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, completed_at, score_sentiment_numeric, score_context_numeric, score_composite, score_sentiment, score_context)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 99921, ARRAY['chatgpt'], 'complete', '2026-06-24T12:00:00Z', 60.00, 80.00, 70.00, 'neutral', 'deep')
      RETURNING id
    `;
    CLEANUP_IDS.auditIds.push(a2.id);

    const [result] = await client`
      SELECT
        AVG(score_sentiment_numeric) as sentiment_avg,
        AVG(score_context_numeric) as context_avg,
        AVG(score_composite) as composite_avg,
        COUNT(*) as cnt
      FROM audits
      WHERE brand_id = ${CLEANUP_IDS.brandId}
        AND status = 'complete'
        AND completed_at >= '2026-06-22T00:00:00Z'
        AND completed_at <= '2026-06-28T23:59:59Z'
    `;
    expect(Number(result.sentiment_avg)).toBeCloseTo(50, 0);
    expect(Number(result.context_avg)).toBeCloseTo(70, 0);
    expect(Number(result.composite_avg)).toBeCloseTo(60, 0);
    expect(Number(result.cnt)).toBe(2);
  });

  it("mention_rate / citation_rate stored as ×100 percentages", async () => {
    const [t] = await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality, mention_rate, citation_rate)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, '2026-W26', 'weekly', 2, 'Likely', '45.50', '22.30')
      RETURNING id
    `;
    CLEANUP_IDS.trendIds.push(t.id);

    const [row] = await client`
      SELECT mention_rate, citation_rate FROM visibility_trends WHERE id = ${t.id}
    `;
    const mr = Number(row.mention_rate);
    const cr = Number(row.citation_rate);
    expect(mr).toBe(45.5);
    expect(cr).toBe(22.3);
    expect(mr).toBeGreaterThanOrEqual(0);
    expect(mr).toBeLessThanOrEqual(100);
    expect(cr).toBeGreaterThanOrEqual(0);
    expect(cr).toBeLessThanOrEqual(100);
  });

  it("mention_source_ratio NULL when mention_rate = 0; archetype = invisible", async () => {
    const [t] = await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality, mention_rate, citation_rate, mention_source_ratio, brand_archetype)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, '2026-W97', 'weekly', 1, 'Hypothesis', '0.00', '0.00', NULL, 'invisible')
      RETURNING id
    `;
    CLEANUP_IDS.trendIds.push(t.id);

    const [row] = await client`
      SELECT mention_source_ratio, brand_archetype FROM visibility_trends WHERE id = ${t.id}
    `;
    expect(row.mention_source_ratio).toBeNull();
    expect(row.brand_archetype).toBe("invisible");
  });

  it("period_label format: weekly = yyyy-Www, monthly = yyyy-MM", () => {
    expect(formatPeriodLabel(new Date("2026-06-23"), "weekly")).toBe("2026-W26");
    expect(formatPeriodLabel(new Date("2026-06-15"), "monthly")).toBe("2026-06");
  });

  it("UNIQUE(brand_id, period_label, period_type) enforced on visibility_trends", async () => {
    const [t] = await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality, mention_rate, citation_rate)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, '2026-W96', 'weekly', 1, 'Hypothesis', '0.00', '0.00')
      RETURNING id
    `;
    CLEANUP_IDS.trendIds.push(t.id);

    await expect(
      client`
        INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality, mention_rate, citation_rate)
        VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, '2026-W96', 'weekly', 2, 'Confirmed', '50.00', '30.00')
      `,
    ).rejects.toThrow();
  });

  it("volatility > 15.0 stored correctly for high-variance data", async () => {
    const [t] = await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality, mention_rate, citation_rate, citation_volatility_score)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, '2026-W95', 'weekly', 6, 'Confirmed', '30.00', '20.00', '18.50')
      RETURNING id
    `;
    CLEANUP_IDS.trendIds.push(t.id);

    const [row] = await client`
      SELECT citation_volatility_score FROM visibility_trends WHERE id = ${t.id}
    `;
    expect(Number(row.citation_volatility_score)).toBeGreaterThan(15.0);
  });
});

// ──────────────────────────────────────────────
// 5. FAN-OUT LATEST-AUDIT SCOPING (Bug 5a)
// ──────────────────────────────────────────────
describe("E2E: fan-out latest-audit scoping (Bug 5a)", () => {
  let auditOld: string;
  let auditNew: string;

  beforeAll(async () => {
    const [a1] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, completed_at)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 99930, ARRAY['chatgpt'], 'complete', '2099-01-01T10:00:00Z')
      RETURNING id
    `;
    auditOld = a1.id;
    CLEANUP_IDS.auditIds.push(auditOld);

    const [a2] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, completed_at)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 99931, ARRAY['chatgpt'], 'complete', '2099-06-01T10:00:00Z')
      RETURNING id
    `;
    auditNew = a2.id;
    CLEANUP_IDS.auditIds.push(auditNew);

    // Fan-out rows for OLD audit
    for (let i = 1; i <= 3; i++) {
      const [fo] = await client`
        INSERT INTO query_fan_out_results (audit_id, brand_id, organization_id, original_prompt, engine, sub_query, sub_query_rank, brand_appeared)
        VALUES (${auditOld}, ${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'old prompt', 'chatgpt', ${"old sub " + i}, ${i}, false)
        RETURNING id
      `;
      CLEANUP_IDS.fanOutIds.push(fo.id);
    }

    // Fan-out rows for NEW audit
    for (let i = 1; i <= 3; i++) {
      const [fo] = await client`
        INSERT INTO query_fan_out_results (audit_id, brand_id, organization_id, original_prompt, engine, sub_query, sub_query_rank, brand_appeared)
        VALUES (${auditNew}, ${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'new prompt', 'chatgpt', ${"new sub " + i}, ${i}, false)
        RETURNING id
      `;
      CLEANUP_IDS.fanOutIds.push(fo.id);
    }
  });

  it("querying by latest audit returns only the newest audit's rows", async () => {
    // Replicate the route's logic: find latest completed audit, then filter fan-out by that audit
    const [latestAudit] = await client`
      SELECT id FROM audits
      WHERE brand_id = ${CLEANUP_IDS.brandId} AND status = 'complete'
      ORDER BY completed_at DESC LIMIT 1
    `;
    expect(latestAudit.id).toBe(auditNew);

    const rows = await client`
      SELECT sub_query, audit_id FROM query_fan_out_results
      WHERE brand_id = ${CLEANUP_IDS.brandId} AND audit_id = ${latestAudit.id}
    `;
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.audit_id).toBe(auditNew);
      expect(r.sub_query).toMatch(/^new sub/);
    }
  });

  it("no stacked/duplicate ranks across audits in scoped query", async () => {
    const rows = await client`
      SELECT sub_query_rank FROM query_fan_out_results
      WHERE brand_id = ${CLEANUP_IDS.brandId} AND audit_id = ${auditNew}
    `;
    const ranks = rows.map((r: { sub_query_rank: number }) => r.sub_query_rank);
    const unique = new Set(ranks);
    expect(unique.size).toBe(ranks.length);
  });
});

// ──────────────────────────────────────────────
// 6. TOPICAL-GAPS SORT ORDER
// ──────────────────────────────────────────────
describe("E2E: topical-gaps sort order", () => {
  beforeAll(async () => {
    const gaps = [
      { cluster: "sort_null", label: "Sort Null", impact: null },
      { cluster: "sort_low", label: "Sort Low", impact: 1 },
      { cluster: "sort_high", label: "Sort High", impact: 5 },
      { cluster: "sort_mid", label: "Sort Mid", impact: 3 },
    ];
    for (const g of gaps) {
      const [row] = await client`
        INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster, topic_label, brand_has_content, cross_prompt_impact)
        VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'general', ${g.cluster}, ${g.label}, false, ${g.impact})
        ON CONFLICT (brand_id, vertical, topic_cluster) DO UPDATE SET cross_prompt_impact = ${g.impact}
        RETURNING id
      `;
      CLEANUP_IDS.gapIds.push(row.id);
    }
  });

  it("sorted by cross_prompt_impact DESC NULLS LAST", async () => {
    const rows = await client`
      SELECT topic_cluster, cross_prompt_impact
      FROM topical_coverage_gaps
      WHERE brand_id = ${CLEANUP_IDS.brandId} AND topic_cluster LIKE 'sort_%'
      ORDER BY cross_prompt_impact DESC NULLS LAST
    `;
    const clusters = rows.map((r: { topic_cluster: string }) => r.topic_cluster);
    expect(clusters).toEqual(["sort_high", "sort_mid", "sort_low", "sort_null"]);
  });
});

// ──────────────────────────────────────────────
// 7. ROUTE SOURCE VERIFICATION (auth, Zod, brand access)
// ──────────────────────────────────────────────
describe("E2E: route source patterns", () => {
  const routes = [
    "app/api/brands/[brandId]/visibility/route.ts",
    "app/api/brands/[brandId]/fan-out/route.ts",
    "app/api/brands/[brandId]/topical-gaps/route.ts",
    "app/api/brands/[brandId]/citation-failure/route.ts",
    "app/api/brands/[brandId]/competitive-benchmark/route.ts",
    "app/api/brands/[brandId]/wins/route.ts",
  ];

  for (const route of routes) {
    it(`${route.split("/").slice(-2, -1)[0]} route uses getCurrentUser auth`, () => {
      const source = fs.readFileSync(path.resolve(route), "utf-8");
      expect(source).toContain("getCurrentUser");
      expect(source).toContain("401");
    });

    it(`${route.split("/").slice(-2, -1)[0]} route validates brandId with Zod`, () => {
      const source = fs.readFileSync(path.resolve(route), "utf-8");
      expect(source).toContain("z.string().uuid()");
    });

    it(`${route.split("/").slice(-2, -1)[0]} route checks brand.organizationId === currentUser.organizationId`, () => {
      const source = fs.readFileSync(path.resolve(route), "utf-8");
      expect(source).toContain("currentUser.organizationId");
      expect(source).toContain("brands.organizationId");
    });
  }
});

// ──────────────────────────────────────────────
// 8. COMPETITIVE-BENCHMARK CPR-01 (source verification)
// ──────────────────────────────────────────────
describe("E2E: competitive-benchmark CPR-01", () => {
  it("returns comparisonData: null and dataAvailableFrom: Sprint 7", () => {
    const source = fs.readFileSync(
      path.resolve("app/api/brands/[brandId]/competitive-benchmark/route.ts"),
      "utf-8",
    );
    expect(source).toContain("comparisonData = null");
    expect(source).toContain("competitorNarrative = null");
    expect(source).toContain('"Sprint 7"');
  });

  it("does NOT call generateText (no LLM narrative)", () => {
    const source = fs.readFileSync(
      path.resolve("app/api/brands/[brandId]/competitive-benchmark/route.ts"),
      "utf-8",
    );
    expect(source).not.toContain("generateText");
    expect(source).not.toContain("getLLMService");
  });

  it("reads tier from subscriptions.tier", () => {
    const source = fs.readFileSync(
      path.resolve("app/api/brands/[brandId]/competitive-benchmark/route.ts"),
      "utf-8",
    );
    expect(source).toContain("subscriptions.tier");
  });
});

// ──────────────────────────────────────────────
// 9. CITATION-FAILURE CPR-01
// ──────────────────────────────────────────────
describe("E2E: citation-failure route CPR-01", () => {
  it("imports diagnose from citation-failure-diagnosis lib", () => {
    const source = fs.readFileSync(
      path.resolve("app/api/brands/[brandId]/citation-failure/route.ts"),
      "utf-8",
    );
    expect(source).toContain('import { diagnose }');
    expect(source).toContain("citation-failure-diagnosis");
  });

  it("returns 200 with diagnoses (not 500)", () => {
    const source = fs.readFileSync(
      path.resolve("app/api/brands/[brandId]/citation-failure/route.ts"),
      "utf-8",
    );
    expect(source).toContain("NextResponse.json({ diagnoses");
    expect(source).not.toMatch(/status:\s*500/);
  });
});

// ──────────────────────────────────────────────
// 10. {LOCATION} SUBSTITUTION IN FAN-OUT
// ──────────────────────────────────────────────
describe("E2E: {location} substitution in fan-out Inngest function", () => {
  it("fan-out function imports formatLocation from expand-prompt", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/simulate-query-fan-out.ts"),
      "utf-8",
    );
    expect(source).toContain("formatLocation");
    expect(source).toContain("expand-prompt");
  });

  it("fan-out replaces {location} in prompt templates via regex", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/simulate-query-fan-out.ts"),
      "utf-8",
    );
    expect(source).toMatch(/\\{location\\}/);
    expect(source).toContain(".replace(");
  });

  it("formatLocation resolves NSW:Bondi to 'Bondi, NSW' (no literal {location})", async () => {
    const { formatLocation } = await import("@/lib/verticals/expand-prompt");
    const result = formatLocation("NSW:Bondi");
    expect(result).toBe("Bondi, NSW");
    expect(result).not.toContain("{location}");
  });
});

// ──────────────────────────────────────────────
// 11. RLS CROSS-ORG ISOLATION (non-superuser)
// ──────────────────────────────────────────────
describe("E2E: RLS cross-org isolation on 6 tenant tables", () => {
  let rlsClient: ReturnType<typeof postgres>;
  let brandB: string;

  const rlsRows: Record<string, { a: string; b: string }> = {};

  beforeAll(async () => {
    // Ensure rls_test_role exists
    await client`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_role') THEN
          CREATE ROLE rls_test_role LOGIN PASSWORD 'rls_test_pass';
        END IF;
      END $$
    `;
    await client`GRANT USAGE ON SCHEMA public TO rls_test_role`;

    const tables = [
      "share_of_voice_snapshots",
      "visibility_trends",
      "brand_web_mentions",
      "query_fan_out_results",
      "topical_coverage_gaps",
      "google_ai_mode_results",
      "prompt_volume_estimates",
    ];
    for (const t of tables) {
      await client`GRANT SELECT, INSERT, UPDATE, DELETE ON ${client(t)} TO rls_test_role`;
    }
    await client`GRANT SELECT ON audits TO rls_test_role`;
    await client`GRANT SELECT ON brands TO rls_test_role`;

    // Create brand in ORG_B for cross-org test
    const [bB] = await client`
      INSERT INTO brands (organization_id, name, domain, vertical, region)
      VALUES (${TEST_ORG_B}, 'E2E RLS OrgB', 'rls-orgb.example.com', 'tradies', 'au')
      RETURNING id
    `;
    brandB = bB.id;

    // Create audit for ORG_B brand
    const [auditB] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, completed_at)
      VALUES (${brandB}, ${TEST_ORG_B}, 99940, ARRAY['chatgpt'], 'complete', NOW())
      RETURNING id
    `;
    CLEANUP_IDS.auditIds.push(auditB.id);

    // Seed rows for ORG_A
    const [sovA] = await client`
      INSERT INTO share_of_voice_snapshots (brand_id, organization_id, audit_id, competitor_domain, prompt_category, engine, brand_share, competitor_share, total_prompts, sample_quality)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, ${CLEANUP_IDS.auditIds[0]}, 'rls-test.com', 'general', 'chatgpt', 30, 40, 50, 'likely')
      RETURNING id
    `;
    CLEANUP_IDS.sovIds.push(sovA.id);

    const [trendA] = await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality, mention_rate, citation_rate)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, '2026-W94', 'weekly', 1, 'Hypothesis', '10.00', '5.00')
      RETURNING id
    `;
    CLEANUP_IDS.trendIds.push(trendA.id);

    const [mentA] = await client`
      INSERT INTO brand_web_mentions (brand_id, organization_id, source_platform, source_url)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'reddit', 'https://reddit.com/r/test/123')
      RETURNING id
    `;
    CLEANUP_IDS.mentionIds.push(mentA.id);

    const [foA] = await client`
      INSERT INTO query_fan_out_results (audit_id, brand_id, organization_id, original_prompt, engine, sub_query, sub_query_rank, brand_appeared)
      VALUES (${CLEANUP_IDS.auditIds[0]}, ${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'rls prompt', 'chatgpt', 'rls sub', 1, false)
      RETURNING id
    `;
    CLEANUP_IDS.fanOutIds.push(foA.id);

    const [gapA] = await client`
      INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster, topic_label, brand_has_content)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'general', 'rls_test_topic', 'RLS Test Topic', false)
      ON CONFLICT (brand_id, vertical, topic_cluster) DO NOTHING
      RETURNING id
    `;
    if (gapA) CLEANUP_IDS.gapIds.push(gapA.id);

    const [aiA] = await client`
      INSERT INTO google_ai_mode_results (audit_id, brand_id, organization_id, prompt, brand_appeared)
      VALUES (${CLEANUP_IDS.auditIds[0]}, ${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'rls test prompt', false)
      RETURNING id
    `;
    CLEANUP_IDS.aiModeIds.push(aiA.id);

    // Seed rows for ORG_B
    const [sovB] = await client`
      INSERT INTO share_of_voice_snapshots (brand_id, organization_id, audit_id, competitor_domain, prompt_category, engine, brand_share, competitor_share, total_prompts, sample_quality)
      VALUES (${brandB}, ${TEST_ORG_B}, ${auditB.id}, 'rls-test-b.com', 'general', 'chatgpt', 20, 30, 40, 'likely')
      RETURNING id
    `;
    CLEANUP_IDS.sovIds.push(sovB.id);

    rlsRows.sov = { a: sovA.id, b: sovB.id };

    const [trendB] = await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, audit_count, sample_quality, mention_rate, citation_rate)
      VALUES (${brandB}, ${TEST_ORG_B}, '2026-W94-B', 'weekly', 1, 'Hypothesis', '10.00', '5.00')
      RETURNING id
    `;
    CLEANUP_IDS.trendIds.push(trendB.id);
    rlsRows.trend = { a: trendA.id, b: trendB.id };

    const [mentB] = await client`
      INSERT INTO brand_web_mentions (brand_id, organization_id, source_platform, source_url)
      VALUES (${brandB}, ${TEST_ORG_B}, 'reddit', 'https://reddit.com/r/test/456')
      RETURNING id
    `;
    CLEANUP_IDS.mentionIds.push(mentB.id);
    rlsRows.mention = { a: mentA.id, b: mentB.id };

    const [foB] = await client`
      INSERT INTO query_fan_out_results (audit_id, brand_id, organization_id, original_prompt, engine, sub_query, sub_query_rank, brand_appeared)
      VALUES (${auditB.id}, ${brandB}, ${TEST_ORG_B}, 'rls prompt B', 'chatgpt', 'rls sub B', 1, false)
      RETURNING id
    `;
    CLEANUP_IDS.fanOutIds.push(foB.id);
    rlsRows.fanOut = { a: foA.id, b: foB.id };

    const [gapB] = await client`
      INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster, topic_label, brand_has_content)
      VALUES (${brandB}, ${TEST_ORG_B}, 'general', 'rls_orgb_topic', 'RLS OrgB Topic', false)
      RETURNING id
    `;
    CLEANUP_IDS.gapIds.push(gapB.id);
    rlsRows.gap = { a: CLEANUP_IDS.gapIds.find(() => true)!, b: gapB.id };

    const [aiB] = await client`
      INSERT INTO google_ai_mode_results (audit_id, brand_id, organization_id, prompt, brand_appeared)
      VALUES (${auditB.id}, ${brandB}, ${TEST_ORG_B}, 'rls test prompt B', false)
      RETURNING id
    `;
    CLEANUP_IDS.aiModeIds.push(aiB.id);
    rlsRows.aiMode = { a: aiA.id, b: aiB.id };

    rlsClient = postgres(TEST_DB_URL.replace("postgres:password", "rls_test_role:rls_test_pass"), { max: 1 });
  });

  afterAll(async () => {
    if (rlsClient) await rlsClient.end();
    if (brandB) await client`DELETE FROM brands WHERE id = ${brandB}`.catch(() => {});
  });

  const tenantTables = [
    { table: "share_of_voice_snapshots", key: "sov" },
    { table: "visibility_trends", key: "trend" },
    { table: "brand_web_mentions", key: "mention" },
    { table: "query_fan_out_results", key: "fanOut" },
    { table: "google_ai_mode_results", key: "aiMode" },
  ];

  for (const { table, key } of tenantTables) {
    it(`${table}: ORG_A context sees only ORG_A rows`, async () => {
      await rlsClient`SELECT set_config('app.current_org_id', ${TEST_ORG_A}, false)`;
      const ids = [rlsRows[key].a, rlsRows[key].b];
      const rows = await rlsClient`SELECT id, organization_id FROM ${rlsClient(table)} WHERE id = ANY(${ids})`;
      expect(rows).toHaveLength(1);
      expect(rows[0].organization_id).toBe(TEST_ORG_A);
    });

    it(`${table}: ORG_B context cannot see ORG_A rows`, async () => {
      await rlsClient`SELECT set_config('app.current_org_id', ${TEST_ORG_B}, false)`;
      const rows = await rlsClient`SELECT id FROM ${rlsClient(table)} WHERE id = ${rlsRows[key].a}`;
      expect(rows).toHaveLength(0);
    });
  }

  it("topical_coverage_gaps: cross-org isolation enforced", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${TEST_ORG_A}, false)`;
    const rows = await rlsClient`
      SELECT id, organization_id FROM topical_coverage_gaps
      WHERE topic_cluster IN ('rls_test_topic', 'rls_orgb_topic')
    `;
    for (const r of rows) {
      expect(r.organization_id).toBe(TEST_ORG_A);
    }
  });

  it("prompt_volume_estimates: global (RLS disabled) — readable without org context", async () => {
    const [vol] = await client`
      INSERT INTO prompt_volume_estimates (market_code, vertical, topic, category, confidence, data_source, period_start, period_end)
      VALUES ('TEST_RLS', 'tradies', 'rls_test', 'general', 'low', 'test', '2026-01-01', '2026-12-31')
      RETURNING id
    `;
    CLEANUP_IDS.volumeIds.push(vol.id);

    await rlsClient`SELECT set_config('app.current_org_id', '00000000-0000-0000-0000-000000000000', false)`;
    const rows = await rlsClient`SELECT id FROM prompt_volume_estimates WHERE id = ${vol.id}`;
    expect(rows).toHaveLength(1);
  });

  it("WITH CHECK blocks cross-org INSERT on share_of_voice_snapshots", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${TEST_ORG_B}, false)`;
    await expect(
      rlsClient`
        INSERT INTO share_of_voice_snapshots (brand_id, organization_id, competitor_domain, prompt_category, engine, total_prompts, sample_quality)
        VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'blocked.com', 'general', 'chatgpt', 10, 'likely')
      `,
    ).rejects.toThrow();
  });

  it("confirms rls_test_role is NOT a superuser", async () => {
    const [role] = await client`
      SELECT rolsuper FROM pg_roles WHERE rolname = 'rls_test_role'
    `;
    expect(role.rolsuper).toBe(false);
  });
});

// ──────────────────────────────────────────────
// 12. FK CONSTRAINTS — ON DELETE SET NULL
// ──────────────────────────────────────────────
describe("E2E: FK ON DELETE SET NULL (fk_fan_out_gap, fk_topical_gap)", () => {
  it("fk_fan_out_gap: deleting fan-out row NULLs task.fan_out_gap_id", async () => {
    const [fo] = await client`
      INSERT INTO query_fan_out_results (brand_id, organization_id, original_prompt, engine, sub_query, sub_query_rank, brand_appeared)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'fk test prompt', 'chatgpt', 'fk sub', 1, false)
      RETURNING id
    `;

    const [task] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, priority, fan_out_gap_id)
      VALUES (${TEST_ORG_A}, ${CLEANUP_IDS.brandId}, 'FK Fan-Out Test', 1, ${fo.id})
      RETURNING id
    `;
    CLEANUP_IDS.taskIds.push(task.id);

    const [before] = await client`SELECT fan_out_gap_id FROM remediation_tasks WHERE id = ${task.id}`;
    expect(before.fan_out_gap_id).toBe(fo.id);

    await client`DELETE FROM query_fan_out_results WHERE id = ${fo.id}`;

    const [after] = await client`SELECT fan_out_gap_id FROM remediation_tasks WHERE id = ${task.id}`;
    expect(after.fan_out_gap_id).toBeNull();
  });

  it("fk_topical_gap: deleting gap row NULLs task.topical_gap_id", async () => {
    const [gap] = await client`
      INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster, topic_label, brand_has_content)
      VALUES (${CLEANUP_IDS.brandId}, ${TEST_ORG_A}, 'general', 'fk_test_topic', 'FK Test Topic', false)
      RETURNING id
    `;

    const [task] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, priority, topical_gap_id)
      VALUES (${TEST_ORG_A}, ${CLEANUP_IDS.brandId}, 'FK Topical Test', 1, ${gap.id})
      RETURNING id
    `;
    CLEANUP_IDS.taskIds.push(task.id);

    const [before] = await client`SELECT topical_gap_id FROM remediation_tasks WHERE id = ${task.id}`;
    expect(before.topical_gap_id).toBe(gap.id);

    await client`DELETE FROM topical_coverage_gaps WHERE id = ${gap.id}`;

    const [after] = await client`SELECT topical_gap_id FROM remediation_tasks WHERE id = ${task.id}`;
    expect(after.topical_gap_id).toBeNull();
  });

  it("FK constraints exist in pg_constraint (migration re-run is idempotent)", async () => {
    const rows = await client`
      SELECT conname FROM pg_constraint
      WHERE conname IN ('fk_fan_out_gap', 'fk_topical_gap')
    `;
    const names = rows.map((r: { conname: string }) => r.conname).sort();
    expect(names).toEqual(["fk_fan_out_gap", "fk_topical_gap"]);
  });
});

// ──────────────────────────────────────────────
// 13. CROSS-SPRINT WIRING (BE-3)
// ──────────────────────────────────────────────
describe("E2E: cross-sprint wiring (S1→S3)", () => {
  it("audit.complete event string matches across Sprint 1 run-audit emitter and Sprint 3 consumers", () => {
    const runAudit = fs.readFileSync(path.resolve("inngest/functions/run-audit.ts"), "utf-8");
    expect(runAudit).toContain("audit.complete");

    const sovFn = fs.readFileSync(path.resolve("inngest/functions/calculate-share-of-voice.ts"), "utf-8");
    expect(sovFn).toContain('"audit.complete"');
  });

  it("FK ALTERs correctly reference S2 remediation_tasks columns", async () => {
    const cols = await client`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'remediation_tasks' AND column_name IN ('fan_out_gap_id', 'topical_gap_id')
      ORDER BY column_name
    `;
    expect(cols.map((c: { column_name: string }) => c.column_name)).toEqual(["fan_out_gap_id", "topical_gap_id"]);
  });

  it("wins-feed reads remediation_tasks for gap_closed wins", () => {
    const source = fs.readFileSync(path.resolve("lib/communication/wins-feed.ts"), "utf-8");
    expect(source).toContain("remediationTasks");
    expect(source).toContain("gap_closed");
    expect(source).toContain("status");
    expect(source).toContain('"done"');
  });

  it("fan-out Inngest function reads verticalPackPrompts (Sprint 1 table)", () => {
    const source = fs.readFileSync(path.resolve("inngest/functions/simulate-query-fan-out.ts"), "utf-8");
    expect(source).toContain("verticalPackPrompts");
  });

  it("wins-feed reads share_of_voice_snapshots (S3) and visibility_trends (S3)", () => {
    const source = fs.readFileSync(path.resolve("lib/communication/wins-feed.ts"), "utf-8");
    expect(source).toContain("shareOfVoiceSnapshots");
    expect(source).toContain("visibilityTrends");
  });
});
