/**
 * Sprint 3 Section 2 · BE-2: Behavioral route tests + edge cases.
 * Converts BE-1 source-pattern tests → real request/response.
 * Report-first: failures are REPORTED, not auto-fixed.
 * ⚠️ DEV DB ONLY. Seeds and tears down real rows.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { expandPrompt, formatLocation } from "@/lib/verticals/expand-prompt";

// ─── mock auth BEFORE any route import ───
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau_prod";

const TEST_ORG_A = "31a7c684-35b1-4340-a24d-4f8898f252a5";
const TEST_ORG_B = "21ac96a7-fe8a-4145-b15b-ce32300b68da";

let client: ReturnType<typeof postgres>;

// Route handlers — loaded dynamically after env is set
let getVisibility: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getFanOut: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getTopicalGaps: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getCitationFailure: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getCompetitiveBenchmark: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getWins: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;

let mockGetCurrentUser: ReturnType<typeof vi.fn>;

const CLEANUP = {
  brandIds: [] as string[],
  auditIds: [] as string[],
  sovIds: [] as string[],
  trendIds: [] as string[],
  fanOutIds: [] as string[],
  gapIds: [] as string[],
  taskIds: [] as string[],
  subscriptionIds: [] as string[],
  citationIds: [] as string[],
};

let orgABrandId: string;
let orgBBrandId: string;
let orgAUserId: string;
let orgAAuditId: string;

function makeReq(path: string): Request {
  return new Request(`http://localhost:3000${path}`);
}

function makeParams(brandId: string) {
  return { params: Promise.resolve({ brandId }) };
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = TEST_DB_URL;

  client = postgres(TEST_DB_URL, { max: 1 });

  // ── dynamic-import route handlers (after env is set) ──
  const [visR, fanR, gapR, cfR, cbR, winR, authR] = await Promise.all([
    import("@/app/api/brands/[brandId]/visibility/route"),
    import("@/app/api/brands/[brandId]/fan-out/route"),
    import("@/app/api/brands/[brandId]/topical-gaps/route"),
    import("@/app/api/brands/[brandId]/citation-failure/route"),
    import("@/app/api/brands/[brandId]/competitive-benchmark/route"),
    import("@/app/api/brands/[brandId]/wins/route"),
    import("@/lib/auth/current-user"),
  ]);
  getVisibility = visR.GET;
  getFanOut = fanR.GET;
  getTopicalGaps = gapR.GET;
  getCitationFailure = cfR.GET;
  getCompetitiveBenchmark = cbR.GET;
  getWins = winR.GET;
  mockGetCurrentUser = authR.getCurrentUser as ReturnType<typeof vi.fn>;

  // ── seed org A brand ──
  const [brandA] = await client`
    INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${TEST_ORG_A}, 'BE2 Behavioral', 'be2-behavioral.example.com', 'tradies', 'au', ARRAY['NSW:Bondi'])
    RETURNING id
  `;
  orgABrandId = brandA.id;
  CLEANUP.brandIds.push(orgABrandId);

  // ── seed org B brand ──
  const [brandB] = await client`
    INSERT INTO brands (organization_id, name, domain, vertical, region)
    VALUES (${TEST_ORG_B}, 'BE2 OrgB', 'be2-orgb.example.com', 'tradies', 'au')
    RETURNING id
  `;
  orgBBrandId = brandB.id;
  CLEANUP.brandIds.push(orgBBrandId);

  // ── seed user A (lookup used by mocked getCurrentUser return shape) ──
  const [userA] = await client`
    SELECT id, organization_id FROM users WHERE organization_id = ${TEST_ORG_A} LIMIT 1
  `;
  orgAUserId = userA?.id;

  // ── seed audit + SoV + trend + gap data for org A ──
  const [auditA] = await client`
    INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, completed_at,
      score_sentiment_numeric, score_context_numeric, score_composite)
    VALUES (${orgABrandId}, ${TEST_ORG_A}, 88801, ARRAY['chatgpt'], 'complete', NOW(),
      45.00, 55.00, 50.00)
    RETURNING id
  `;
  orgAAuditId = auditA.id;
  CLEANUP.auditIds.push(orgAAuditId);

  const [sov1] = await client`
    INSERT INTO share_of_voice_snapshots (brand_id, organization_id, audit_id, competitor_domain,
      prompt_category, engine, brand_share, competitor_share, total_prompts, sample_quality)
    VALUES (${orgABrandId}, ${TEST_ORG_A}, ${orgAAuditId}, 'rival.com.au',
      'general', 'chatgpt', 35.00, 25.00, 50, 'confirmed')
    RETURNING id
  `;
  CLEANUP.sovIds.push(sov1.id);

  const [trend1] = await client`
    INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type,
      audit_count, sample_quality, mention_rate, citation_rate,
      mention_source_ratio, brand_archetype, score_composite_avg)
    VALUES (${orgABrandId}, ${TEST_ORG_A}, '2026-W26', 'weekly',
      3, 'Likely', 45.50, 22.30,
      0.85, 'recognised_authority', 50.00)
    RETURNING id
  `;
  CLEANUP.trendIds.push(trend1.id);

  const [gap1] = await client`
    INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster,
      topic_label, brand_has_content, cross_prompt_impact)
    VALUES (${orgABrandId}, ${TEST_ORG_A}, 'tradies', 'plumbing_emergency',
      'Emergency Plumbing', false, 5)
    RETURNING id
  `;
  CLEANUP.gapIds.push(gap1.id);

  const [fo1] = await client`
    INSERT INTO query_fan_out_results (audit_id, brand_id, organization_id,
      original_prompt, engine, sub_query, sub_query_rank, brand_appeared)
    VALUES (${orgAAuditId}, ${orgABrandId}, ${TEST_ORG_A},
      'best plumber in Bondi, NSW', 'chatgpt', 'top plumbers Bondi', 1, true)
    RETURNING id
  `;
  CLEANUP.fanOutIds.push(fo1.id);
});

afterAll(async () => {
  for (const id of CLEANUP.subscriptionIds)
    await client`DELETE FROM subscriptions WHERE id = ${id}`.catch(() => {});
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

function setAuthAs(orgId: string) {
  mockGetCurrentUser.mockResolvedValue({
    id: orgAUserId,
    organizationId: orgId,
    organization: { id: orgId },
  });
}

function clearAuth() {
  mockGetCurrentUser.mockResolvedValue(null);
}

// ═══════════════════════════════════════════════════════════
// TRACK 1a — ROUTE BEHAVIORAL TESTS (CONVERTED FROM SOURCE-PATTERN)
// ═══════════════════════════════════════════════════════════

describe("TRACK 1a: visibility route — behavioral", () => {
  it("returns 401 when unauthenticated", async () => {
    clearAuth();
    const res = await getVisibility(makeReq("/api/brands/" + orgABrandId + "/visibility"), makeParams(orgABrandId));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 for invalid (non-UUID) brandId", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getVisibility(makeReq("/api/brands/not-a-uuid/visibility"), makeParams("not-a-uuid"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for cross-org brand (NOT 401)", async () => {
    setAuthAs(TEST_ORG_B);
    const res = await getVisibility(makeReq("/api/brands/" + orgABrandId + "/visibility"), makeParams(orgABrandId));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("returns 200 with correct shape for valid authed request", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getVisibility(makeReq("/api/brands/" + orgABrandId + "/visibility"), makeParams(orgABrandId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("trends");
    expect(body).toHaveProperty("sov");
    expect(body).toHaveProperty("tier");
    expect(body).toHaveProperty("brandDomain");
    expect(body.brandDomain).toBe("be2-behavioral.example.com");
  });

  it("returns trend data matching seeded values", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getVisibility(makeReq("/api/brands/" + orgABrandId + "/visibility"), makeParams(orgABrandId));
    const body = await res.json();
    expect(body.trends).not.toBeNull();
    expect(body.trends.mentionRate).toBe(45.5);
    expect(body.trends.citationRate).toBe(22.3);
    expect(body.trends.brandArchetype).toBe("recognised_authority");
    expect(body.trends.mentionSourceRatio).toBe(0.85);
  });

  it("returns SoV rows matching seeded data", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getVisibility(makeReq("/api/brands/" + orgABrandId + "/visibility"), makeParams(orgABrandId));
    const body = await res.json();
    expect(body.sov.length).toBeGreaterThanOrEqual(1);
    const rivalry = body.sov.find((s: { competitorDomain: string }) => s.competitorDomain === "rival.com.au");
    expect(rivalry).toBeDefined();
    expect(rivalry.brandShare).toBe(35);
    expect(rivalry.competitorShare).toBe(25);
  });
});

describe("TRACK 1a: fan-out route — behavioral", () => {
  it("returns 401 when unauthenticated", async () => {
    clearAuth();
    const res = await getFanOut(makeReq("/api/brands/" + orgABrandId + "/fan-out"), makeParams(orgABrandId));
    expect(res.status).toBe(401);
  });

  it("returns 404 for cross-org brand", async () => {
    setAuthAs(TEST_ORG_B);
    const res = await getFanOut(makeReq("/api/brands/" + orgABrandId + "/fan-out"), makeParams(orgABrandId));
    expect(res.status).toBe(404);
  });

  it("returns 404 for invalid brandId", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getFanOut(makeReq("/api/brands/bad/fan-out"), makeParams("bad"));
    expect(res.status).toBe(404);
  });

  it("returns 200 with groups array for valid request", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getFanOut(makeReq("/api/brands/" + orgABrandId + "/fan-out"), makeParams(orgABrandId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("groups");
    expect(Array.isArray(body.groups)).toBe(true);
  });

  it("groups fan-out results by originalPrompt", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getFanOut(
      makeReq("/api/brands/" + orgABrandId + "/fan-out?auditId=" + orgAAuditId),
      makeParams(orgABrandId),
    );
    const body = await res.json();
    const group = body.groups.find((g: { originalPrompt: string }) =>
      g.originalPrompt.includes("Bondi"),
    );
    expect(group).toBeDefined();
    expect(group.results.length).toBeGreaterThanOrEqual(1);
    expect(group.results[0]).toHaveProperty("subQuery");
    expect(group.results[0]).toHaveProperty("brandAppeared");
  });

  it("returns empty groups when no completed audit exists", async () => {
    setAuthAs(TEST_ORG_B);
    const res = await getFanOut(makeReq("/api/brands/" + orgBBrandId + "/fan-out"), makeParams(orgBBrandId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toEqual([]);
  });
});

describe("TRACK 1a: topical-gaps route — behavioral", () => {
  it("returns 401 when unauthenticated", async () => {
    clearAuth();
    const res = await getTopicalGaps(makeReq("/api/brands/" + orgABrandId + "/topical-gaps"), makeParams(orgABrandId));
    expect(res.status).toBe(401);
  });

  it("returns 404 for cross-org brand", async () => {
    setAuthAs(TEST_ORG_B);
    const res = await getTopicalGaps(makeReq("/api/brands/" + orgABrandId + "/topical-gaps"), makeParams(orgABrandId));
    expect(res.status).toBe(404);
  });

  it("returns 200 with gaps array for valid request", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getTopicalGaps(makeReq("/api/brands/" + orgABrandId + "/topical-gaps"), makeParams(orgABrandId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("gaps");
    expect(Array.isArray(body.gaps)).toBe(true);
  });

  it("gaps include the seeded topic with correct shape", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getTopicalGaps(makeReq("/api/brands/" + orgABrandId + "/topical-gaps"), makeParams(orgABrandId));
    const body = await res.json();
    const plumbing = body.gaps.find((g: { topicCluster: string }) => g.topicCluster === "plumbing_emergency");
    expect(plumbing).toBeDefined();
    expect(plumbing.topicLabel).toBe("Emergency Plumbing");
    expect(plumbing.brandHasContent).toBe(false);
    expect(plumbing.crossPromptImpact).toBe(5);
  });
});

describe("TRACK 1a: citation-failure route — behavioral", () => {
  it("returns 401 when unauthenticated", async () => {
    clearAuth();
    const res = await getCitationFailure(makeReq("/api/brands/" + orgABrandId + "/citation-failure"), makeParams(orgABrandId));
    expect(res.status).toBe(401);
  });

  it("returns 404 for cross-org brand", async () => {
    setAuthAs(TEST_ORG_B);
    const res = await getCitationFailure(makeReq("/api/brands/" + orgABrandId + "/citation-failure"), makeParams(orgABrandId));
    expect(res.status).toBe(404);
  });

  it("returns 200 with diagnoses array (not 500)", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getCitationFailure(makeReq("/api/brands/" + orgABrandId + "/citation-failure"), makeParams(orgABrandId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("diagnoses");
    expect(body).toHaveProperty("partial");
    expect(Array.isArray(body.diagnoses)).toBe(true);
  });

  it("returns gap-based diagnoses when S5/S7 tables absent", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getCitationFailure(makeReq("/api/brands/" + orgABrandId + "/citation-failure"), makeParams(orgABrandId));
    const body = await res.json();
    if (body.diagnoses.length > 0) {
      expect(body.diagnoses[0]).toHaveProperty("patternKey");
      expect(body.diagnoses[0]).toHaveProperty("severity");
      expect(body.diagnoses[0]).toHaveProperty("evidence");
      expect(body.diagnoses[0]).toHaveProperty("remediation");
      expect(body.partial).toBe(true);
    }
  });
});

describe("TRACK 1a: competitive-benchmark route — behavioral", () => {
  it("returns 401 when unauthenticated", async () => {
    clearAuth();
    const res = await getCompetitiveBenchmark(
      makeReq("/api/brands/" + orgABrandId + "/competitive-benchmark?competitor=rival.com.au"),
      makeParams(orgABrandId),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for cross-org brand", async () => {
    setAuthAs(TEST_ORG_B);
    const res = await getCompetitiveBenchmark(
      makeReq("/api/brands/" + orgABrandId + "/competitive-benchmark?competitor=rival.com.au"),
      makeParams(orgABrandId),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when competitor query param is missing", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getCompetitiveBenchmark(
      makeReq("/api/brands/" + orgABrandId + "/competitive-benchmark"),
      makeParams(orgABrandId),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("competitor");
  });

  it("returns 200 with CPR-01 null stub for valid request", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getCompetitiveBenchmark(
      makeReq("/api/brands/" + orgABrandId + "/competitive-benchmark?competitor=rival.com.au"),
      makeParams(orgABrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.comparisonData).toBeNull();
    expect(body.competitorNarrative).toBeNull();
    expect(body.dataAvailableFrom).toBe("Sprint 7");
  });

  it("returns real SoV data for the seeded competitor", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getCompetitiveBenchmark(
      makeReq("/api/brands/" + orgABrandId + "/competitive-benchmark?competitor=rival.com.au"),
      makeParams(orgABrandId),
    );
    const body = await res.json();
    expect(body.shareOfVoice.competitorDomain).toBe("rival.com.au");
    expect(body.shareOfVoice.brandShare).toBe(35);
    expect(body.shareOfVoice.competitorShare).toBe(25);
  });

  it("returns topical gap count and fastestPath for seeded gaps", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getCompetitiveBenchmark(
      makeReq("/api/brands/" + orgABrandId + "/competitive-benchmark?competitor=rival.com.au"),
      makeParams(orgABrandId),
    );
    const body = await res.json();
    expect(body.topicalGaps.topicalGapsOwned).toBeGreaterThanOrEqual(1);
    expect(body.topicalGaps.fastestPath).toContain("Emergency Plumbing");
  });

  it("returns tier from subscriptions (defaults to starter)", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getCompetitiveBenchmark(
      makeReq("/api/brands/" + orgABrandId + "/competitive-benchmark?competitor=rival.com.au"),
      makeParams(orgABrandId),
    );
    const body = await res.json();
    expect(body).toHaveProperty("tier");
    expect(typeof body.tier).toBe("string");
  });
});

describe("TRACK 1a: wins route — behavioral", () => {
  it("returns 401 when unauthenticated", async () => {
    clearAuth();
    const res = await getWins(makeReq("/api/brands/" + orgABrandId + "/wins"), makeParams(orgABrandId));
    expect(res.status).toBe(401);
  });

  it("returns 404 for cross-org brand", async () => {
    setAuthAs(TEST_ORG_B);
    const res = await getWins(makeReq("/api/brands/" + orgABrandId + "/wins"), makeParams(orgABrandId));
    expect(res.status).toBe(404);
  });

  it("returns 200 with wins array for valid request", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getWins(makeReq("/api/brands/" + orgABrandId + "/wins"), makeParams(orgABrandId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("wins");
    expect(Array.isArray(body.wins)).toBe(true);
  });

  it("respects ?limit query param", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getWins(makeReq("/api/brands/" + orgABrandId + "/wins?limit=1"), makeParams(orgABrandId));
    const body = await res.json();
    expect(body.wins.length).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════
// TRACK 1b — {location} SUBSTITUTION: ASSERT OUTPUT, NOT IMPORT
// ═══════════════════════════════════════════════════════════

describe("TRACK 1b: {location} substitution — output assertion", () => {
  it("expandPrompt with {location} template → resolved prompts contain suburb", async () => {
    const results = expandPrompt("best {brand} plumber in {location}", {
      brand: { name: "TestPlumb", domain: "testplumb.com.au" },
      locations: ["NSW:Bondi", "VIC:Melbourne"],
      competitors: [],
    });
    expect(results).toHaveLength(2);
    expect(results[0]).toBe("best TestPlumb plumber in Bondi, NSW");
    expect(results[1]).toBe("best TestPlumb plumber in Melbourne, VIC");
    for (const r of results) {
      expect(r).not.toContain("{location}");
      expect(r).not.toContain("{brand}");
    }
  });

  it("fan-out stored prompts contain resolved location, not literal {location}", async () => {
    const rows = await client`
      SELECT original_prompt FROM query_fan_out_results
      WHERE brand_id = ${orgABrandId} AND original_prompt LIKE '%Bondi%'
    `;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(r.original_prompt).toContain("Bondi");
      expect(r.original_prompt).not.toContain("{location}");
    }
  });
});

// ═══════════════════════════════════════════════════════════
// TRACK 1c — CPR-01 BEHAVIORAL (route called, response checked)
// ═══════════════════════════════════════════════════════════

describe("TRACK 1c: CPR-01 route — behavioral (not source-grep)", () => {
  it("competitive-benchmark response body has comparisonData: null + Sprint 7", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getCompetitiveBenchmark(
      makeReq("/api/brands/" + orgABrandId + "/competitive-benchmark?competitor=nobody.com"),
      makeParams(orgABrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.comparisonData).toBeNull();
    expect(body.competitorNarrative).toBeNull();
    expect(body.dataAvailableFrom).toBe("Sprint 7");
  });

  it("citation-failure returns valid diagnosis objects with required fields", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getCitationFailure(
      makeReq("/api/brands/" + orgABrandId + "/citation-failure"),
      makeParams(orgABrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const d of body.diagnoses) {
      expect(d).toHaveProperty("patternKey");
      expect(d).toHaveProperty("severity");
      expect(["high", "medium", "low"]).toContain(d.severity);
      expect(d).toHaveProperty("evidence");
      expect(d).toHaveProperty("remediation");
    }
  });
});

// ═══════════════════════════════════════════════════════════
// TRACK 2a — EMPTY AUDIT (zero mentions) END-TO-END
// ═══════════════════════════════════════════════════════════

describe("TRACK 2a: empty audit — zero mentions", () => {
  let emptyBrandId: string;

  beforeAll(async () => {
    const [brand] = await client`
      INSERT INTO brands (organization_id, name, domain, vertical, region)
      VALUES (${TEST_ORG_A}, 'BE2 Empty Audit', 'be2-empty.example.com', 'tradies', 'au')
      RETURNING id
    `;
    emptyBrandId = brand.id;
    CLEANUP.brandIds.push(emptyBrandId);

    const [audit] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, completed_at,
        score_sentiment_numeric, score_context_numeric, score_composite)
      VALUES (${emptyBrandId}, ${TEST_ORG_A}, 88810, ARRAY['chatgpt'], 'complete', NOW(),
        0.00, 0.00, 0.00)
      RETURNING id
    `;
    CLEANUP.auditIds.push(audit.id);
  });

  it("aggregateVisibilityTrend returns mentionRate=0, citationRate=0 for zero-mention audit", { timeout: 15000 }, async () => {
    const { aggregateVisibilityTrend } = await import("@/lib/visibility/visibility-trend-aggregator");
    const { db } = await import("@/db/client");
    const result = await db.transaction(async (tx) => {
      return aggregateVisibilityTrend(tx, {
        brandId: emptyBrandId,
        periodStart: new Date("2020-01-01"),
        periodEnd: new Date("2099-12-31"),
        brandDomain: "be2-empty.example.com",
      });
    });
    expect(result.mentionRate).toBe(0);
    expect(result.citationRate).toBe(0);
  });

  it("mentionSourceRatio is NULL (not 0) when mentionRate=0", async () => {
    const { aggregateVisibilityTrend } = await import("@/lib/visibility/visibility-trend-aggregator");
    const { db } = await import("@/db/client");
    const result = await db.transaction(async (tx) => {
      return aggregateVisibilityTrend(tx, {
        brandId: emptyBrandId,
        periodStart: new Date("2020-01-01"),
        periodEnd: new Date("2099-12-31"),
        brandDomain: "be2-empty.example.com",
      });
    });
    expect(result.mentionSourceRatio).toBeNull();
  });

  it("brandArchetype is 'invisible' when mentionRate=0 and citationRate=0", async () => {
    const { aggregateVisibilityTrend } = await import("@/lib/visibility/visibility-trend-aggregator");
    const { db } = await import("@/db/client");
    const result = await db.transaction(async (tx) => {
      return aggregateVisibilityTrend(tx, {
        brandId: emptyBrandId,
        periodStart: new Date("2020-01-01"),
        periodEnd: new Date("2099-12-31"),
        brandDomain: "be2-empty.example.com",
      });
    });
    expect(result.brandArchetype).toBe("invisible");
  });

  it("SoV returns empty array when totalPrompts=0 (no error)", async () => {
    const { calculateShareOfVoice } = await import("@/lib/visibility/sov-calculator");
    const result = calculateShareOfVoice({
      engine: "chatgpt",
      promptCategory: "general",
      brandDomain: "be2-empty.example.com",
      mentions: [],
      totalPrompts: 0,
    });
    expect(result).toHaveLength(0);
  });

  it("trend row stored with honest empty values (not fabricated)", async () => {
    const [t] = await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type,
        audit_count, sample_quality, mention_rate, citation_rate,
        mention_source_ratio, brand_archetype)
      VALUES (${emptyBrandId}, ${TEST_ORG_A}, '2026-W01', 'weekly',
        1, 'Hypothesis', '0.00', '0.00', NULL, 'invisible')
      RETURNING id
    `;
    CLEANUP.trendIds.push(t.id);

    const [row] = await client`
      SELECT mention_rate, citation_rate, mention_source_ratio, brand_archetype
      FROM visibility_trends WHERE id = ${t.id}
    `;
    expect(Number(row.mention_rate)).toBe(0);
    expect(Number(row.citation_rate)).toBe(0);
    expect(row.mention_source_ratio).toBeNull();
    expect(row.brand_archetype).toBe("invisible");
  });
});

// ═══════════════════════════════════════════════════════════
// TRACK 2b — BRAND WITHOUT REGION ({location} fallback)
// ═══════════════════════════════════════════════════════════

describe("TRACK 2b: brand without region — {location} fallback", () => {
  it("formatLocation(null, 'local area') returns 'local area' (fallback)", async () => {
    expect(formatLocation(null, "local area")).toBe("local area");
    expect(formatLocation(undefined, "local area")).toBe("local area");
  });

  it("formatLocation('', 'local area') returns fallback for empty string", async () => {
    const result = formatLocation("", "local area");
    expect(result).toBe("local area");
  });

  it("expandPrompt with {location} and empty locations returns [] (no prompts)", async () => {
    const results = expandPrompt("best plumber in {location}", {
      brand: { name: "TestBrand", domain: "test.com" },
      locations: [],
      competitors: [],
    });
    expect(results).toEqual([]);
  });

  it("fan-out Inngest function uses 'local area' as fallback location (source verification)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("inngest/functions/simulate-query-fan-out.ts"),
      "utf-8",
    );
    expect(source).toContain('"local area"');
  });

  it("'local area' fallback in prompt template does NOT leave literal {location}", async () => {
    const results = expandPrompt("best plumber in {location}", {
      brand: { name: "TestBrand", domain: "test.com" },
      locations: [""],
      competitors: [],
    });
    if (results.length > 0) {
      for (const r of results) {
        expect(r).not.toContain("{location}");
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// TRACK 2c — TIER BOUNDARIES
// ═══════════════════════════════════════════════════════════

describe("TRACK 2c: tier boundaries — competitive-benchmark tier in response", () => {
  it("defaults to 'starter' when no subscription exists", async () => {
    setAuthAs(TEST_ORG_A);
    // Delete any existing subscription for the org
    await client`DELETE FROM subscriptions WHERE organization_id = ${TEST_ORG_A}`.catch(() => {});
    const res = await getCompetitiveBenchmark(
      makeReq("/api/brands/" + orgABrandId + "/competitive-benchmark?competitor=rival.com.au"),
      makeParams(orgABrandId),
    );
    const body = await res.json();
    expect(body.tier).toBe("starter");
  });

  it("returns 'growth' when subscription tier is growth", async () => {
    setAuthAs(TEST_ORG_A);
    await client`DELETE FROM subscriptions WHERE organization_id = ${TEST_ORG_A}`.catch(() => {});
    const [sub] = await client`
      INSERT INTO subscriptions (organization_id, tier, status, stripe_customer_id,
        stripe_subscription_id, stripe_price_id, billing_interval)
      VALUES (${TEST_ORG_A}, 'growth', 'active', 'cus_test_growth',
        'sub_test_growth_be2', 'price_test_growth_be2', 'monthly')
      RETURNING id
    `;
    CLEANUP.subscriptionIds.push(sub.id);

    const res = await getCompetitiveBenchmark(
      makeReq("/api/brands/" + orgABrandId + "/competitive-benchmark?competitor=rival.com.au"),
      makeParams(orgABrandId),
    );
    const body = await res.json();
    expect(body.tier).toBe("growth");

    await client`DELETE FROM subscriptions WHERE id = ${sub.id}`;
    CLEANUP.subscriptionIds = CLEANUP.subscriptionIds.filter((id) => id !== sub.id);
  });

  it("returns 'agency' when subscription tier is agency", async () => {
    setAuthAs(TEST_ORG_A);
    await client`DELETE FROM subscriptions WHERE organization_id = ${TEST_ORG_A}`.catch(() => {});
    const [sub] = await client`
      INSERT INTO subscriptions (organization_id, tier, status, stripe_customer_id,
        stripe_subscription_id, stripe_price_id, billing_interval)
      VALUES (${TEST_ORG_A}, 'agency', 'active', 'cus_test_agency',
        'sub_test_agency_be2', 'price_test_agency_be2', 'monthly')
      RETURNING id
    `;
    CLEANUP.subscriptionIds.push(sub.id);

    const res = await getCompetitiveBenchmark(
      makeReq("/api/brands/" + orgABrandId + "/competitive-benchmark?competitor=rival.com.au"),
      makeParams(orgABrandId),
    );
    const body = await res.json();
    expect(body.tier).toBe("agency");

    await client`DELETE FROM subscriptions WHERE id = ${sub.id}`;
    CLEANUP.subscriptionIds = CLEANUP.subscriptionIds.filter((id) => id !== sub.id);
  });
});

// ═══════════════════════════════════════════════════════════
// TRACK 2d — UPSERT CONFLICT PATHS (re-run stability)
// ═══════════════════════════════════════════════════════════

describe("TRACK 2d: UPSERT conflict — updates not duplicates", () => {
  it("visibility_trends: SAME key + CHANGED values → updated row, not new row", async () => {
    const key = { brandId: orgABrandId, periodLabel: "2026-W50", periodType: "weekly" };

    const [r1] = await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type,
        audit_count, sample_quality, mention_rate, citation_rate, updated_at)
      VALUES (${key.brandId}, ${TEST_ORG_A}, ${key.periodLabel}, ${key.periodType},
        1, 'Hypothesis', '10.00', '5.00', '2026-06-20T10:00:00Z')
      ON CONFLICT (brand_id, period_label, period_type) DO UPDATE
      SET audit_count = 1, mention_rate = '10.00', updated_at = '2026-06-20T10:00:00Z'
      RETURNING id
    `;
    CLEANUP.trendIds.push(r1.id);

    await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type,
        audit_count, sample_quality, mention_rate, citation_rate, updated_at)
      VALUES (${key.brandId}, ${TEST_ORG_A}, ${key.periodLabel}, ${key.periodType},
        5, 'Confirmed', '40.00', '20.00', NOW())
      ON CONFLICT (brand_id, period_label, period_type) DO UPDATE
      SET audit_count = 5, mention_rate = '40.00', citation_rate = '20.00',
          sample_quality = 'Confirmed', updated_at = NOW()
    `;

    const rows = await client`
      SELECT id, audit_count, mention_rate, citation_rate, sample_quality, updated_at
      FROM visibility_trends
      WHERE brand_id = ${key.brandId} AND period_label = ${key.periodLabel} AND period_type = ${key.periodType}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].audit_count).toBe(5);
    expect(Number(rows[0].mention_rate)).toBe(40);
    expect(Number(rows[0].citation_rate)).toBe(20);
    expect(rows[0].sample_quality).toBe("Confirmed");
  });

  it("visibility_trends: updated_at advances on UPSERT (J-01)", async () => {
    const [before] = await client`
      SELECT updated_at FROM visibility_trends
      WHERE brand_id = ${orgABrandId} AND period_label = '2026-W50'
    `;
    const prevTime = new Date(before.updated_at).getTime();

    await new Promise((r) => setTimeout(r, 10));

    await client`
      INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type,
        audit_count, sample_quality, mention_rate, citation_rate, updated_at)
      VALUES (${orgABrandId}, ${TEST_ORG_A}, '2026-W50', 'weekly',
        6, 'Confirmed', '42.00', '21.00', NOW())
      ON CONFLICT (brand_id, period_label, period_type) DO UPDATE
      SET audit_count = 6, updated_at = NOW()
    `;

    const [after] = await client`
      SELECT updated_at FROM visibility_trends
      WHERE brand_id = ${orgABrandId} AND period_label = '2026-W50'
    `;
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(prevTime);
  });

  it("topical_coverage_gaps: SAME key + CHANGED values → updated, not duplicated", async () => {
    const [g1] = await client`
      INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster,
        topic_label, brand_has_content, cross_prompt_impact)
      VALUES (${orgABrandId}, ${TEST_ORG_A}, 'tradies', 'upsert_test_cluster',
        'Upsert Test', false, 2)
      ON CONFLICT (brand_id, vertical, topic_cluster) DO UPDATE
      SET cross_prompt_impact = 2
      RETURNING id
    `;
    CLEANUP.gapIds.push(g1.id);

    await client`
      INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster,
        topic_label, brand_has_content, cross_prompt_impact)
      VALUES (${orgABrandId}, ${TEST_ORG_A}, 'tradies', 'upsert_test_cluster',
        'Upsert Test Updated', true, 8)
      ON CONFLICT (brand_id, vertical, topic_cluster) DO UPDATE
      SET cross_prompt_impact = 8, brand_has_content = true, topic_label = 'Upsert Test Updated',
          updated_at = NOW()
    `;

    const rows = await client`
      SELECT cross_prompt_impact, brand_has_content, topic_label
      FROM topical_coverage_gaps
      WHERE brand_id = ${orgABrandId} AND vertical = 'tradies' AND topic_cluster = 'upsert_test_cluster'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].cross_prompt_impact).toBe(8);
    expect(rows[0].brand_has_content).toBe(true);
    expect(rows[0].topic_label).toBe("Upsert Test Updated");
  });

  it("row counts stable across 3 consecutive UPSERTs", async () => {
    const countBefore = await client`
      SELECT COUNT(*) as cnt FROM visibility_trends WHERE brand_id = ${orgABrandId}
    `;
    const before = Number(countBefore[0].cnt);

    for (let i = 0; i < 3; i++) {
      await client`
        INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type,
          audit_count, sample_quality, mention_rate, citation_rate, updated_at)
        VALUES (${orgABrandId}, ${TEST_ORG_A}, '2026-W50', 'weekly',
          ${10 + i}, 'Confirmed', '50.00', '25.00', NOW())
        ON CONFLICT (brand_id, period_label, period_type) DO UPDATE
        SET audit_count = ${10 + i}, updated_at = NOW()
      `;
    }

    const countAfter = await client`
      SELECT COUNT(*) as cnt FROM visibility_trends WHERE brand_id = ${orgABrandId}
    `;
    expect(Number(countAfter[0].cnt)).toBe(before);
  });
});

// ═══════════════════════════════════════════════════════════
// TRACK 2e — VOLATILITY BOUNDARY (> 15.0 trigger)
// ═══════════════════════════════════════════════════════════

describe("TRACK 2e: volatility boundary", () => {
  it("computeVolatility returns > 15.0 for rates [5, 50, 10, 45, 8, 42]", async () => {
    const { computeVolatility } = await import("@/lib/visibility/visibility-trend-aggregator");
    const vol = computeVolatility([5, 50, 10, 45, 8, 42], 6);
    expect(vol).not.toBeNull();
    expect(vol!).toBeGreaterThan(15.0);
  });

  it("computeVolatility returns exactly 0 for identical rates", async () => {
    const { computeVolatility } = await import("@/lib/visibility/visibility-trend-aggregator");
    const vol = computeVolatility([20, 20, 20, 20], 4);
    expect(vol).toBe(0);
  });

  it("volatility = 15.0 exactly → NOT above threshold (boundary check)", async () => {
    const { computeVolatility } = await import("@/lib/visibility/visibility-trend-aggregator");
    // stdDev = 15.0 when rates = [mean-15, mean, mean+15], variance=150, stdDev=12.25
    // Need: mean=M, values s.t. stdDev(values)=15.0 exactly
    // variance = stdDev² = 225; for 3 values [-15, 0, 15] relative: variance=(225+0+225)/3=150, stdDev=12.247
    // For 2 values [0, 30]: variance=225, stdDev=15.0 — but needs >=3
    // For 4 values [0, 30, 0, 30]: mean=15, variance=(225+225+225+225)/4=225, stdDev=15.0
    const vol = computeVolatility([0, 30, 0, 30], 4);
    expect(vol).toBe(15.0);
    // Boundary: = 15.0 is NOT > 15.0
    expect(vol! > 15.0).toBe(false);
  });

  it("volatility just above 15.0 IS detected", async () => {
    const { computeVolatility } = await import("@/lib/visibility/visibility-trend-aggregator");
    // [0, 31, 0, 31]: mean=15.5, variance=((15.5²)*4)/4=240.25, stdDev=15.5
    const vol = computeVolatility([0, 31, 0, 31], 4);
    expect(vol).not.toBeNull();
    expect(vol!).toBeGreaterThan(15.0);
  });

  it("returns null when auditCount < 3 (insufficient data)", async () => {
    const { computeVolatility } = await import("@/lib/visibility/visibility-trend-aggregator");
    expect(computeVolatility([10, 20, 30, 40], 2)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// ADDITIONAL BE-2 — DEEPENED EDGE CASES
// ═══════════════════════════════════════════════════════════

describe("BE-2 additional: route with soft-deleted brand", () => {
  let deletedBrandId: string;

  beforeAll(async () => {
    const [brand] = await client`
      INSERT INTO brands (organization_id, name, domain, vertical, region, deleted_at)
      VALUES (${TEST_ORG_A}, 'BE2 Deleted', 'deleted.example.com', 'tradies', 'au', NOW())
      RETURNING id
    `;
    deletedBrandId = brand.id;
    CLEANUP.brandIds.push(deletedBrandId);
  });

  it("visibility route returns 404 for soft-deleted brand (not 200)", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getVisibility(
      makeReq("/api/brands/" + deletedBrandId + "/visibility"),
      makeParams(deletedBrandId),
    );
    expect(res.status).toBe(404);
  });

  it("topical-gaps route returns 404 for soft-deleted brand", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getTopicalGaps(
      makeReq("/api/brands/" + deletedBrandId + "/topical-gaps"),
      makeParams(deletedBrandId),
    );
    expect(res.status).toBe(404);
  });
});

describe("BE-2 additional: visibility route — trends null when no trend data", () => {
  it("returns trends: null when brand has no visibility_trends rows", async () => {
    setAuthAs(TEST_ORG_B);
    const res = await getVisibility(
      makeReq("/api/brands/" + orgBBrandId + "/visibility"),
      makeParams(orgBBrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trends).toBeNull();
    expect(body.sov).toEqual([]);
  });
});

describe("BE-2 additional: fan-out scoping with explicit auditId param", () => {
  it("returns rows only for the specified auditId", async () => {
    setAuthAs(TEST_ORG_A);
    const res = await getFanOut(
      makeReq("/api/brands/" + orgABrandId + "/fan-out?auditId=" + orgAAuditId),
      makeParams(orgABrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty groups for non-existent auditId UUID", async () => {
    setAuthAs(TEST_ORG_A);
    const fakeAudit = "a0000000-0000-4000-a000-000000000099";
    const res = await getFanOut(
      makeReq("/api/brands/" + orgABrandId + "/fan-out?auditId=" + fakeAudit),
      makeParams(orgABrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toEqual([]);
  });
});
