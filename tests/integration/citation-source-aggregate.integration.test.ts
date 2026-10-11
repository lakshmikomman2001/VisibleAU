/**
 * Task #41: Citation Source Intelligence was the 5th surface of the
 * lib/llm/cache.ts 48h replay bug (after #23/#24/#36/#39/#40) -- counts
 * included all ~4 cache-replay rows per (engine, prompt), AND every
 * completed audit wrote its own permanent row set with no rollup
 * (csi_unique_with_audit is scoped per audit_id), so the screen showed
 * an ever-growing wall of per-audit duplicate cards.
 *
 * Fixed: buildCitationSourceIntelligence now filters to run_number = 1
 * before counting, and additionally upserts a single rolling "current"
 * row per (brand, engine, sourceType) into the aggregate slot the
 * schema already reserved (csi_unique_aggregate, audit_id IS NULL) --
 * exercised here against a real Postgres (the already-reserved partial
 * unique index + onConflictDoUpdate's targetWhere can't be meaningfully
 * verified with a mock). getCurrentCitationSources reads that aggregate,
 * falling back to the single most recent audit's own rows when no
 * aggregate exists yet (so the screen never goes empty immediately after
 * deploy, before the next audit runs). See
 * docs/ops/post-launch-db-hardening.md section 41.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildCitationSourceIntelligence,
  getCurrentCitationSources,
} from "@/lib/trust/citation-intelligence";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

const TEST_ORG_ID = "55002ea0-5555-4aaa-8bbb-000000000001";
const TEST_BRAND_ID = "55002ea0-5555-4aaa-8bbb-000000000002";
const AUDIT_1_ID = "55002ea0-5555-4aaa-8bbb-000000000003";
const AUDIT_2_ID = "55002ea0-5555-4aaa-8bbb-000000000004";

const RUNS_PER_PROMPT = 5;

let client: ReturnType<typeof postgres>;

// Task #43: buildCitationSourceIntelligence now re-classifies every URL
// in cited_sources (via classifyCitedSources) instead of reading the
// stored cited_source_type column directly -- so seeding must provide a
// real, classifiable URL, not just the expected type label. One
// real-domain example per type used in this file is enough.
const SAMPLE_URL_FOR_TYPE: Record<string, string> = {
  au_directory: "https://hipages.com.au/connect/plumber",
};

async function seedCitations(
  auditId: string,
  rows: { prompt: string; sourceType: string; brandMentioned: boolean }[],
) {
  for (const { prompt, sourceType, brandMentioned } of rows) {
    const url = SAMPLE_URL_FOR_TYPE[sourceType];
    if (!url) throw new Error(`No SAMPLE_URL_FOR_TYPE mapping for "${sourceType}"`);
    const citedSources = JSON.stringify([{ domain: new URL(url).hostname, url }]);

    for (let run = 1; run <= RUNS_PER_PROMPT; run++) {
      await client`
        INSERT INTO citations (
          audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt,
          cited_source_type, cited_sources
        )
        VALUES (
          ${auditId}, 'chatgpt', ${prompt}, ${run}, ${brandMentioned}, false, ${sourceType},
          ${citedSources}
        )
      `;
    }
  }
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = TEST_DB_URL;
  client = postgres(TEST_DB_URL, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${TEST_ORG_ID}, 'csi-aggregate-clerk', 'CSI Aggregate Test Org', 'csi-aggregate')
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'CSI Aggregate Test Brand', 'csi-aggregate-test.example.com', 'tradies', 'au', ARRAY['NSW:Sydney'])
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, completed_at)
    VALUES (${AUDIT_1_ID}, ${TEST_BRAND_ID}, ${TEST_ORG_ID}, 101, 'complete', ARRAY['chatgpt'], NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, completed_at)
    VALUES (${AUDIT_2_ID}, ${TEST_BRAND_ID}, ${TEST_ORG_ID}, 102, 'complete', ARRAY['chatgpt'], NOW())
    ON CONFLICT (id) DO NOTHING
  `;
});

afterAll(async () => {
  await client`DELETE FROM citation_source_intelligence WHERE brand_id = ${TEST_BRAND_ID}`.catch(
    () => {},
  );
  await client`DELETE FROM citations WHERE audit_id IN (${AUDIT_1_ID}, ${AUDIT_2_ID})`.catch(
    () => {},
  );
  await client`DELETE FROM audits WHERE id IN (${AUDIT_1_ID}, ${AUDIT_2_ID})`.catch(() => {});
  await client`DELETE FROM brands WHERE id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${TEST_ORG_ID}`.catch(() => {});
  await client.end();
});

describe("⚠️ task #41 — buildCitationSourceIntelligence dedupes replays and writes the reserved aggregate slot", () => {
  it("audit 1: 3 prompts x 5 runs for au_directory -> citationCount is 3 (run_number=1 only), not 15", async () => {
    const { db } = await import("@/db/client");

    await seedCitations(AUDIT_1_ID, [
      { prompt: "Best plumber in Sydney (hipages)?", sourceType: "au_directory", brandMentioned: false },
      { prompt: "Who installs hot water systems?", sourceType: "au_directory", brandMentioned: false },
      { prompt: "Emergency plumber near me?", sourceType: "au_directory", brandMentioned: true },
    ]);

    const result = await buildCitationSourceIntelligence(db, AUDIT_1_ID, TEST_BRAND_ID, TEST_ORG_ID);

    const auDir = result.find((r) => r.sourceType === "au_directory");
    expect(auDir).toBeDefined();
    // 3 distinct prompts, run_number=1 only -- NOT 15 (3 prompts x 5 replays)
    expect(auDir?.citationCount).toBe(3);
    expect(auDir?.brandPresentInSource).toBe(true); // one of the 3 prompts mentioned the brand
  });

  it("the per-audit row (audit_id = AUDIT_1_ID) and the aggregate row (audit_id IS NULL) both exist with the same count", async () => {
    const perAudit = await client`
      SELECT citation_count FROM citation_source_intelligence
      WHERE brand_id = ${TEST_BRAND_ID} AND audit_id = ${AUDIT_1_ID} AND source_type = 'au_directory'
    `;
    expect(perAudit).toHaveLength(1);
    expect(perAudit[0].citation_count).toBe(3);

    const aggregate = await client`
      SELECT citation_count FROM citation_source_intelligence
      WHERE brand_id = ${TEST_BRAND_ID} AND audit_id IS NULL AND source_type = 'au_directory'
    `;
    expect(aggregate).toHaveLength(1);
    expect(aggregate[0].citation_count).toBe(3);
  });

  it("getCurrentCitationSources returns the aggregate row for au_directory (count 3)", async () => {
    const { db } = await import("@/db/client");
    const sources = await getCurrentCitationSources(db, TEST_BRAND_ID);
    const auDir = sources.find((s) => s.sourceType === "au_directory");
    expect(auDir?.citationCount).toBe(3);
  });

  it("audit 2 (same brand, different numbers): the aggregate row is REPLACED, not duplicated, while a second per-audit row is added", async () => {
    const { db } = await import("@/db/client");

    await seedCitations(AUDIT_2_ID, [
      { prompt: "Top rated plumbers Sydney?", sourceType: "au_directory", brandMentioned: false },
    ]);

    await buildCitationSourceIntelligence(db, AUDIT_2_ID, TEST_BRAND_ID, TEST_ORG_ID);

    // Aggregate: exactly one row for (brand, engine, au_directory), now
    // reflecting audit 2's own count (1), not audit 1's (3) and not a
    // second row.
    const aggregate = await client`
      SELECT citation_count, brand_present_in_source FROM citation_source_intelligence
      WHERE brand_id = ${TEST_BRAND_ID} AND audit_id IS NULL AND source_type = 'au_directory'
    `;
    expect(aggregate).toHaveLength(1);
    expect(aggregate[0].citation_count).toBe(1);
    expect(aggregate[0].brand_present_in_source).toBe(false);

    // Per-audit rows: both audit 1's and audit 2's own rows still exist
    // separately -- this write path is unchanged for existing consumers
    // (narrative-generator.ts, local-ai-trust-scorer.ts).
    const perAuditRows = await client`
      SELECT audit_id, citation_count FROM citation_source_intelligence
      WHERE brand_id = ${TEST_BRAND_ID} AND audit_id IS NOT NULL AND source_type = 'au_directory'
      ORDER BY citation_count
    `;
    expect(perAuditRows).toHaveLength(2);
    expect(perAuditRows.map((r) => r.citation_count)).toEqual([1, 3]);

    const sources = await getCurrentCitationSources(db, TEST_BRAND_ID);
    expect(sources.filter((s) => s.sourceType === "au_directory")).toHaveLength(1);
    expect(sources.find((s) => s.sourceType === "au_directory")?.citationCount).toBe(1);
  });

  it("getCurrentCitationSources falls back to the latest audit's own rows when no aggregate rows exist yet", async () => {
    const { db } = await import("@/db/client");

    // Simulates pre-deploy data: no aggregate rows have ever been
    // written (no audit has run under the task #41 code), only the old
    // per-audit accumulation. Temporarily delete the aggregate rows to
    // reproduce that state.
    await client`DELETE FROM citation_source_intelligence WHERE brand_id = ${TEST_BRAND_ID} AND audit_id IS NULL`;

    const sources = await getCurrentCitationSources(db, TEST_BRAND_ID);

    // Falls back to AUDIT_2_ID's row set (the most recently calculated
    // audit) -- not the full 2-audit pile (which would be 2 rows for
    // au_directory: 1 and 3).
    const auDirRows = sources.filter((s) => s.sourceType === "au_directory");
    expect(auDirRows).toHaveLength(1);
    expect(auDirRows[0].citationCount).toBe(1); // audit 2's number, not audit 1's
  });
});
