/**
 * Task #46 (4th follow-up, "BEFORE pushing ee21e46+a988c80+d3854ce"):
 * the NO_CITATIONS_SOURCE_TYPE sentinel row (`d3854ce`) is written into
 * citation_source_intelligence through the exact same per-audit-row and
 * aggregate-replace machinery as a real category -- any reader that
 * counts, ranks, or sums rows from that table could mistake it for one.
 * Proves against a real database that narrative-generator.ts and
 * local-ai-trust-scorer.ts produce IDENTICAL output whether an engine's
 * "cited nothing" sentinel row is present or that engine was never
 * audited at all, and that buildCitationSourceIntelligence/
 * getCurrentCitationSources correctly keep the sentinel out of category
 * counts/shares. See docs/ops/post-launch-db-hardening.md section 46
 * (4th follow-up).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildCitationSourceIntelligence,
  getCurrentCitationSources,
} from "@/lib/trust/citation-intelligence";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
const TEST_ORG_ID = "88007fc3-8888-4eee-8fff-000000000001";

// Brand A: Gemini has 5 empty-answer citations (the sentinel) alongside
// Claude's and Perplexity's real citations. Brand B: the SAME Claude/
// Perplexity data, but no Gemini citations at all -- as if Gemini was
// never audited. Readers that leak the sentinel will disagree between
// A and B; readers that handle it correctly will agree.
const BRAND_A_ID = "88007fc3-8888-4eee-8fff-000000000002";
const BRAND_B_ID = "88007fc3-8888-4eee-8fff-000000000003";
const AUDIT_A_ID = "88007fc3-8888-4eee-8fff-000000000004";
const AUDIT_B_ID = "88007fc3-8888-4eee-8fff-000000000005";

let client: ReturnType<typeof postgres>;

async function seedRealCitations(auditId: string) {
  // Claude: 2 au_directory + 2 review_site + 1 empty-answer, each a
  // distinct organic (run_number=1) response -- the 1 empty one must
  // not dilute either real category's share.
  const claudeRows: Array<{ domain: string; url: string }[]> = [
    [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }],
    [{ domain: "oneflare.com.au", url: "https://oneflare.com.au/b" }],
    [{ domain: "productreview.com.au", url: "https://productreview.com.au/c" }],
    [{ domain: "trustpilot.com", url: "https://trustpilot.com/d" }],
    [],
  ];
  for (const citedSources of claudeRows) {
    for (let run = 1; run <= 5; run++) {
      await client`
        INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources)
        VALUES (${auditId}, 'claude', 'Sentinel-leak prompt', ${run}, false, false, ${JSON.stringify(citedSources)})
      `;
    }
  }
  // Perplexity: 1 real review_site response.
  for (let run = 1; run <= 5; run++) {
    await client`
      INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources)
      VALUES (${auditId}, 'perplexity', 'Perplexity prompt', ${run}, false, false, ${JSON.stringify([
        { domain: "g.page", url: "https://g.page/bondi-plumbing", origin: "retrieved" },
      ])})
    `;
  }
}

async function seedGeminiSentinel(auditId: string) {
  // 5 distinct organic responses, every one empty -- the sentinel.
  for (let p = 0; p < 5; p++) {
    for (let run = 1; run <= 5; run++) {
      await client`
        INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources)
        VALUES (${auditId}, 'gemini', ${`Gemini empty prompt ${p}`}, ${run}, false, false, '[]')
      `;
    }
  }
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = TEST_DB_URL;
  client = postgres(TEST_DB_URL, { max: 1 });

  await client`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${TEST_ORG_ID}, 'csi-sentinel-leak-clerk', 'CSI Sentinel Leak Org', 'csi-sentinel-leak') ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions) VALUES (${BRAND_A_ID}, ${TEST_ORG_ID}, 'Sentinel Leak Brand A', 'sentinel-a.bondiplumbing.com.au', 'tradies', 'au', ARRAY['NSW:Sydney']) ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions) VALUES (${BRAND_B_ID}, ${TEST_ORG_ID}, 'Sentinel Leak Brand B', 'sentinel-b.bondiplumbing.com.au', 'tradies', 'au', ARRAY['NSW:Sydney']) ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, completed_at) VALUES (${AUDIT_A_ID}, ${BRAND_A_ID}, ${TEST_ORG_ID}, 601, 'complete', ARRAY['gemini','claude','perplexity'], NOW()) ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, completed_at) VALUES (${AUDIT_B_ID}, ${BRAND_B_ID}, ${TEST_ORG_ID}, 602, 'complete', ARRAY['claude','perplexity'], NOW()) ON CONFLICT (id) DO NOTHING`;

  // Brand A: Gemini sentinel + the real Claude/Perplexity data.
  await seedGeminiSentinel(AUDIT_A_ID);
  await seedRealCitations(AUDIT_A_ID);
  // Brand B (control): the SAME real data, Gemini never audited at all.
  await seedRealCitations(AUDIT_B_ID);

  const { db } = await import("@/db/client");
  await buildCitationSourceIntelligence(db, AUDIT_A_ID, BRAND_A_ID, TEST_ORG_ID);
  await buildCitationSourceIntelligence(db, AUDIT_B_ID, BRAND_B_ID, TEST_ORG_ID);
});

afterAll(async () => {
  await client`DELETE FROM citation_source_intelligence WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})`.catch(
    () => {},
  );
  await client`DELETE FROM citations WHERE audit_id IN (${AUDIT_A_ID}, ${AUDIT_B_ID})`.catch(() => {});
  await client`DELETE FROM audits WHERE id IN (${AUDIT_A_ID}, ${AUDIT_B_ID})`.catch(() => {});
  await client`DELETE FROM brands WHERE id IN (${BRAND_A_ID}, ${BRAND_B_ID})`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${TEST_ORG_ID}`.catch(() => {});
  await client.end();
});

describe("category counts and shares exclude the sentinel (real DB)", () => {
  it("categories excludes Gemini's sentinel entirely -- only Claude's and Perplexity's real categories appear", async () => {
    const { db } = await import("@/db/client");
    const { categories, enginesWithoutCitations } = await getCurrentCitationSources(
      db,
      BRAND_A_ID,
    );

    expect(categories.every((c) => c.engine !== "gemini")).toBe(true);
    expect(enginesWithoutCitations).toHaveLength(1);
    expect(enginesWithoutCitations[0]).toMatchObject({ engine: "gemini", answerCount: 5 });
  });

  it("Claude's 1 empty response doesn't dilute its two real categories' shares -- each is 50% of 4 real responses, not 40% of 5", async () => {
    const { db } = await import("@/db/client");
    const { categories } = await getCurrentCitationSources(db, BRAND_A_ID);

    const auDir = categories.find((c) => c.engine === "claude" && c.sourceType === "au_directory");
    const reviewSite = categories.find(
      (c) => c.engine === "claude" && c.sourceType === "review_site",
    );
    expect(auDir?.citationCount).toBe(2);
    expect(reviewSite?.citationCount).toBe(2);
    expect(Number(auDir?.citationShare)).toBe(50);
    expect(Number(reviewSite?.citationShare)).toBe(50);
  });
});

describe("narrative-generator.ts produces identical output whether Gemini's sentinel is present or Gemini was never audited", () => {
  async function runNarrativeSourceTypeGaps(brandId: string) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { generateNarrative } = await import("@/lib/communication/narrative-generator");
    const narrativeDb = postgres(TEST_DB_URL, { max: 1 });
    const db = drizzle(narrativeDb);
    const result = await generateNarrative(db as never, {
      brandId,
      organizationId: TEST_ORG_ID,
      periodLabel: "2026-T-sentinel-leak",
      tier: "growth" as never,
      engine: "claude" as never,
      sections: [{ type: "source_type_gaps", include: true }],
      scoreCompositeDelta: null,
      hasPriorPeriod: false,
    });
    await narrativeDb.end();
    return result;
  }

  it("'N source types analysed' is the same for brand A (sentinel present) and brand B (Gemini never audited)", async () => {
    const [resultA, resultB] = await Promise.all([
      runNarrativeSourceTypeGaps(BRAND_A_ID),
      runNarrativeSourceTypeGaps(BRAND_B_ID),
    ]);

    // Both brands have exactly 2 real per-audit category rows
    // (claude/au_directory, claude/review_site -- perplexity/review_site
    // upserts into the SAME (engine, sourceType) key as... no, it's a
    // different engine, so 3 real rows total: claude/au_directory,
    // claude/review_site, perplexity/review_site).
    expect(resultA.narrativeText).toContain("3 source types analysed");
    expect(resultB.narrativeText).toContain("3 source types analysed");
    expect(resultA.narrativeText).toBe(resultB.narrativeText);
  });
});

describe("local-ai-trust-scorer.ts produces identical output whether Gemini's sentinel is present or Gemini was never audited", () => {
  it("computeLocalAiTrustScore agrees for brand A and brand B -- au_directory filter already excludes the sentinel regardless", async () => {
    const { db } = await import("@/db/client");
    const { computeLocalAiTrustScore } = await import("@/lib/platform/local-ai-trust-scorer");

    const [scoreA, scoreB] = await Promise.all([
      computeLocalAiTrustScore(db, BRAND_A_ID, "tradies"),
      computeLocalAiTrustScore(db, BRAND_B_ID, "tradies"),
    ]);

    expect(scoreA.breakdown.citation).toBe(scoreB.breakdown.citation);
    expect(scoreA.localAiTrustScore).toBe(scoreB.localAiTrustScore);
  });
});
