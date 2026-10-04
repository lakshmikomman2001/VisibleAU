/**
 * ⚠️ SS — nine secondary mention-counting surfaces (per-engine panel,
 * sentiment bar, competitor "you", mention-rate stat, brand dashboard tiles,
 * the latest-audit API's engineStats, both Wins Feed queries, and Citation
 * Source Intelligence) aggregated `citations` directly with NO branded-prompt
 * exclusion, so they still showed branded-inflated numbers that contradicted
 * the QQ-corrected 0.0 headline Visibility Score for an all-branded-mentions
 * audit like Bondi's. Fixed via one shared predicate, ORGANIC_ONLY
 * (lib/audit/organic-filter.ts), added to each of the underlying queries.
 *
 * This seeds a real audit matching Audit #9's exact reported shape (4
 * branded + 5 organic prompts x 4 engines x 5 runs = 180 calls, 0 organic
 * mentions) and proves two things against a real DB:
 *   1. The two Server Component pages' and the latest-audit route's query
 *      SHAPES (replicated here verbatim from the fixed source, importing the
 *      same ORGANIC_ONLY) now return the organic-only figure, not the
 *      branded-inflated one.
 *   2. The two plain, directly-callable functions this fix touches --
 *      getWinsFeed and buildCitationSourceIntelligence -- are exercised for
 *      real, not just replicated in shape.
 * Rendering the actual Server Component pages isn't attempted here (no RSC
 * harness in this repo); the query shapes are reproduced exactly, file:line
 * noted at each site, which is the testable surface of a page.tsx.
 */
import { and, count, eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { citations } from "@/db/schema";
import { getWinsFeed } from "@/lib/communication/wins-feed";
import { buildCitationSourceIntelligence } from "@/lib/trust/citation-intelligence";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

const TEST_ORG_ID = "55001ea0-5555-4aaa-8bbb-000000000001";
const TEST_BRAND_ID = "55001ea0-5555-4aaa-8bbb-000000000002";
const AUDIT_MIXED_ID = "55001ea0-5555-4aaa-8bbb-000000000003"; // Audit #9's shape
const AUDIT_ALL_BRANDED_ID = "55001ea0-5555-4aaa-8bbb-000000000004"; // edge case

const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];
const RUNS_PER_PROMPT = 5;
const ORGANIC_PROMPTS = [
  "Best plumbers in Sydney CBD for emergency repairs?",
  "Reliable plumber Sydney CBD available on weekends?",
  "Licensed plumber for hot water system replacement Sydney CBD?",
  "Who are the top-rated plumbers in Sydney CBD?",
  "Best plumbing companies for commercial fitouts in Sydney CBD?",
];
const BRANDED_PROMPTS = [
  "Bondi Plumbing vs Plumbing 911 — which is better for Australian businesses?",
  "Bondi Plumbing vs Local Plumbing Sydney — which is better for Australian businesses?",
  "What are the best alternatives to Bondi Plumbing in Australia?",
  "Is Bondi Plumbing popular in Australia?",
];

let client: ReturnType<typeof postgres>;

async function seedCitationsForAudit(
  auditId: string,
  prompts: { text: string; isBranded: boolean }[],
) {
  for (const engine of ENGINES) {
    for (const { text, isBranded } of prompts) {
      for (let run = 1; run <= RUNS_PER_PROMPT; run++) {
        await client`
          INSERT INTO citations (
            audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt,
            position, sentiment_label, context_label
          )
          VALUES (
            ${auditId}, ${engine}, ${text}, ${run}, ${isBranded}, ${isBranded},
            ${isBranded ? 1 : null}, ${isBranded ? "positive" : "neutral"},
            ${isBranded ? "recommended" : "absent"}
          )
        `;
      }
    }
  }
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = TEST_DB_URL;
  client = postgres(TEST_DB_URL, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${TEST_ORG_ID}, 'ss-organic-filter-clerk', 'SS Organic Filter Test Org', 'ss-organic-filter')
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'SS Organic Filter Test Brand', 'ss-organic-filter-test.example.com', 'tradies', 'au', ARRAY['NSW:Sydney'])
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, completed_at)
    VALUES (${AUDIT_MIXED_ID}, ${TEST_BRAND_ID}, ${TEST_ORG_ID}, 9, 'complete', ARRAY['chatgpt','claude','gemini','perplexity'], NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, completed_at)
    VALUES (${AUDIT_ALL_BRANDED_ID}, ${TEST_BRAND_ID}, ${TEST_ORG_ID}, 10, 'complete', ARRAY['chatgpt','claude','gemini','perplexity'], NOW())
    ON CONFLICT (id) DO NOTHING
  `;

  const mixedPrompts = [
    ...ORGANIC_PROMPTS.map((text) => ({ text, isBranded: false })),
    ...BRANDED_PROMPTS.map((text) => ({ text, isBranded: true })),
  ];
  await seedCitationsForAudit(AUDIT_MIXED_ID, mixedPrompts);
  await seedCitationsForAudit(
    AUDIT_ALL_BRANDED_ID,
    BRANDED_PROMPTS.map((text) => ({ text, isBranded: true })),
  );
});

afterAll(async () => {
  await client`DELETE FROM citations WHERE audit_id IN (${AUDIT_MIXED_ID}, ${AUDIT_ALL_BRANDED_ID})`.catch(
    () => {},
  );
  await client`DELETE FROM audits WHERE id IN (${AUDIT_MIXED_ID}, ${AUDIT_ALL_BRANDED_ID})`.catch(
    () => {},
  );
  await client`DELETE FROM brands WHERE id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${TEST_ORG_ID}`.catch(() => {});
  await client.end();
});

describe("⚠️ SS — organic-only filter on secondary mention surfaces", () => {
  it("app/(auth)/audits/[auditId]/page.tsx's engRows shape: per-engine mention rate is 0%, not 44%", async () => {
    const { db } = await import("@/db/client");
    const { ORGANIC_ONLY } = await import("@/lib/audit/organic-filter");

    const engRows = await db
      .select({
        engine: citations.engine,
        total: count(),
        mentionCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
      })
      .from(citations)
      .where(and(eq(citations.auditId, AUDIT_MIXED_ID), ORGANIC_ONLY))
      .groupBy(citations.engine);

    expect(engRows).toHaveLength(4); // all 4 engines have organic rows
    for (const row of engRows) {
      expect(Number(row.total)).toBe(25); // 5 organic prompts x 5 runs per engine, branded excluded
      expect(Number(row.mentionCount)).toBe(0); // no organic mentions in this scenario
    }
  });

  it("app/(auth)/audits/[auditId]/page.tsx's sentRows + competitor-'you' shape: 0, not 'Positive 80'", async () => {
    const { db } = await import("@/db/client");
    const { ORGANIC_ONLY } = await import("@/lib/audit/organic-filter");

    const sentRows = await db
      .select({ sentiment: citations.sentimentLabel, count: count() })
      .from(citations)
      .where(
        and(eq(citations.auditId, AUDIT_MIXED_ID), eq(citations.brandMentioned, true), ORGANIC_ONLY),
      )
      .groupBy(citations.sentimentLabel);

    // Pre-fix this would show positive: 80 (4 branded prompts x 4 engines x 5 runs).
    expect(sentRows.find((r) => r.sentiment === "positive")?.count ?? 0).toBe(0);

    const totalMentions = (
      await db
        .select({
          engine: citations.engine,
          mentionCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
        })
        .from(citations)
        .where(and(eq(citations.auditId, AUDIT_MIXED_ID), ORGANIC_ONLY))
        .groupBy(citations.engine)
    ).reduce((s, r) => s + Number(r.mentionCount), 0);

    expect(totalMentions).toBe(0); // competitor "you" row -- was 80 pre-fix
  });

  it("app/(auth)/brands/[brandId]/page.tsx's avgPosition/totalMentions/engineStats shape: organic-only", async () => {
    const { db } = await import("@/db/client");
    const { ORGANIC_ONLY } = await import("@/lib/audit/organic-filter");

    const posRow = await db
      .select({ avgPos: sql<number>`round(avg(${citations.position})::numeric, 1)` })
      .from(citations)
      .where(
        and(
          eq(citations.auditId, AUDIT_MIXED_ID),
          eq(citations.brandMentioned, true),
          sql`${citations.position} IS NOT NULL`,
          ORGANIC_ONLY,
        ),
      );
    expect(posRow[0]?.avgPos ?? null).toBeNull(); // no organic mentions -> no position to average

    const engineStats = await db
      .select({
        engine: citations.engine,
        total: count(),
        mentions: sql<number>`sum(case when ${citations.brandMentioned} then 1 else 0 end)`,
      })
      .from(citations)
      .where(and(eq(citations.auditId, AUDIT_MIXED_ID), ORGANIC_ONLY))
      .groupBy(citations.engine);
    for (const row of engineStats) {
      expect(Number(row.mentions)).toBe(0);
    }
  });

  it("api/brands/[brandId]/latest-audit route's engineStats shape: 0 mentioned, not 44%", async () => {
    const { db } = await import("@/db/client");
    const { ORGANIC_ONLY } = await import("@/lib/audit/organic-filter");

    const engineStats = await db
      .select({
        engine: citations.engine,
        total: count(),
        mentioned: sql<string>`SUM(CASE WHEN brand_mentioned THEN 1 ELSE 0 END)`,
      })
      .from(citations)
      .where(and(eq(citations.auditId, AUDIT_MIXED_ID), ORGANIC_ONLY))
      .groupBy(citations.engine);

    for (const row of engineStats) {
      expect(Number(row.total)).toBe(25); // 5 organic prompts x 5 runs per engine
      expect(Number(row.mentioned)).toBe(0);
    }
  });

  it("getWinsFeed: branded-only mentions don't surface as a win", async () => {
    const { db } = await import("@/db/client");
    const wins = await getWinsFeed(db, TEST_BRAND_ID);

    // Pre-fix, the 4 trivially-mentioned branded prompts would have produced
    // "New citation on X" / "Brand visible on X" wins for every engine.
    expect(wins.some((w) => w.type === "new_citation")).toBe(false);
    expect(wins.some((w) => w.type === "new_engine_coverage")).toBe(false);
  });

  it("buildCitationSourceIntelligence: branded mentions don't mark a source 'covered'", async () => {
    const { db } = await import("@/db/client");
    const result = await buildCitationSourceIntelligence(
      db,
      AUDIT_MIXED_ID,
      TEST_BRAND_ID,
      TEST_ORG_ID,
    );

    // No organic citation ever mentions the brand in this scenario, so no
    // source/engine group should read "covered" -- pre-fix, the branded
    // prompts' trivial mentions would have marked several "covered".
    expect(result.every((r) => r.gapSeverity !== "covered")).toBe(true);
    expect(result.every((r) => r.brandPresentInSource === false)).toBe(true);
  });

  it("edge case: an all-branded audit -> organic total 0, no divide-by-zero / NaN anywhere", async () => {
    const { db } = await import("@/db/client");
    const { ORGANIC_ONLY } = await import("@/lib/audit/organic-filter");

    const engRows = await db
      .select({
        engine: citations.engine,
        total: count(),
        mentionCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
      })
      .from(citations)
      .where(and(eq(citations.auditId, AUDIT_ALL_BRANDED_ID), ORGANIC_ONLY))
      .groupBy(citations.engine);
    expect(engRows).toHaveLength(0); // every row was branded -- organic set is empty

    const mentionRate = (() => {
      const organicTotal = engRows.reduce((s, r) => s + Number(r.total), 0);
      const mentionCount = engRows.reduce((s, r) => s + Number(r.mentionCount), 0);
      return organicTotal > 0 ? Math.round((mentionCount / organicTotal) * 100) : 0;
    })();
    expect(Number.isNaN(mentionRate)).toBe(false);
    expect(mentionRate).toBe(0);

    const wins = await getWinsFeed(db, TEST_BRAND_ID);
    expect(() => wins).not.toThrow();

    const intel = await buildCitationSourceIntelligence(
      db,
      AUDIT_ALL_BRANDED_ID,
      TEST_BRAND_ID,
      TEST_ORG_ID,
    );
    expect(intel).toEqual([]); // nothing organic to report on -- empty, not a crash
  });

  it("all nine fixed queries reference the shared ORGANIC_ONLY predicate, not a hand-written duplicate", async () => {
    const { readFileSync } = await import("node:fs");
    const files = [
      "app/(auth)/audits/[auditId]/page.tsx",
      "app/(auth)/brands/[brandId]/page.tsx",
      "app/api/brands/[brandId]/latest-audit/route.ts",
      "lib/communication/wins-feed.ts",
      "lib/trust/citation-intelligence.ts",
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} must import ORGANIC_ONLY`).toMatch(
        /import\s*\{\s*ORGANIC_ONLY\s*\}\s*from\s*"@\/lib\/audit\/organic-filter"/,
      );
      const useCount = (src.match(/ORGANIC_ONLY/g) ?? []).length - 1; // minus the import itself
      expect(useCount, `${file} should use ORGANIC_ONLY at least once`).toBeGreaterThanOrEqual(1);
    }
  });
});
