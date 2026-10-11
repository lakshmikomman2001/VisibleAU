/**
 * Task #46 follow-up ("BEFORE pushing ee21e46"): the rolling aggregate
 * (citation_source_intelligence, audit_id IS NULL) was only ever
 * upserted per (engine, sourceType) group -- a category present in
 * audit N but absent from audit N+1 kept its stale audit-N row
 * forever, since nothing ever told it to go away. Concretely: Bondi's
 * Gemini "other" (5 citations, 0 domains, from before task #46's
 * count-integrity fix) would still render after a re-audit fixed the
 * underlying extraction, because its aggregate row was never deleted.
 *
 * Fixed by replacing, not merging: every buildCitationSourceIntelligence
 * call now deletes the brand's whole aggregate row set and re-inserts
 * the CURRENT audit's full set, inside one savepoint. See
 * docs/ops/post-launch-db-hardening.md section 46 (aggregate
 * replace-set follow-up).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildCitationSourceIntelligence,
  getCurrentCitationSources,
  NO_CITATIONS_SOURCE_TYPE,
} from "@/lib/trust/citation-intelligence";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
const TEST_ORG_ID = "77006fb2-7777-4ddd-8eee-000000000001";
const TEST_BRAND_ID = "77006fb2-7777-4ddd-8eee-000000000002";
const AUDIT_N_ID = "77006fb2-7777-4ddd-8eee-000000000003";
const AUDIT_N1_ID = "77006fb2-7777-4ddd-8eee-000000000004";
const AUDIT_N2_ID = "77006fb2-7777-4ddd-8eee-000000000005";
const AUDIT_N3_ID = "77006fb2-7777-4ddd-8eee-000000000006";
const AUDIT_N4_ID = "77006fb2-7777-4ddd-8eee-000000000007";

let client: ReturnType<typeof postgres>;

async function seedCitations(
  auditId: string,
  rows: { engine: string; citedSources: { domain: string; url: string }[] }[],
) {
  for (const { engine, citedSources } of rows) {
    for (let run = 1; run <= 5; run++) {
      await client`
        INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources)
        VALUES (${auditId}, ${engine}, 'Replace-set prompt', ${run}, false, false, ${JSON.stringify(citedSources)})
      `;
    }
  }
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = TEST_DB_URL;
  client = postgres(TEST_DB_URL, { max: 1 });

  await client`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${TEST_ORG_ID}, 'csi-replace-clerk', 'CSI Replace Org', 'csi-replace') ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions) VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'CSI Replace Brand', 'bondiplumbing.com.au', 'tradies', 'au', ARRAY['NSW:Sydney']) ON CONFLICT (id) DO NOTHING`;
  for (const [id, num] of [
    [AUDIT_N_ID, 501],
    [AUDIT_N1_ID, 502],
    [AUDIT_N2_ID, 503],
    [AUDIT_N3_ID, 504],
    [AUDIT_N4_ID, 505],
  ] as const) {
    await client`INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, completed_at) VALUES (${id}, ${TEST_BRAND_ID}, ${TEST_ORG_ID}, ${num}, 'complete', ARRAY['gemini','claude'], NOW()) ON CONFLICT (id) DO NOTHING`;
    // Small, real gap between each audit's completed_at so the
    // "latest completed audit" cross-check (task #46 follow-up Part B)
    // has an unambiguous order to read, matching how real audits
    // actually complete sequentially.
    await client`SELECT pg_sleep(0.05)`;
  }
});

afterAll(async () => {
  await client`ALTER TABLE citation_source_intelligence DROP CONSTRAINT IF EXISTS temp_block_null_audit_id`.catch(
    () => {},
  );
  await client`DELETE FROM citation_source_intelligence WHERE brand_id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM citations WHERE audit_id IN (${AUDIT_N_ID}, ${AUDIT_N1_ID}, ${AUDIT_N2_ID}, ${AUDIT_N3_ID}, ${AUDIT_N4_ID})`.catch(
    () => {},
  );
  await client`DELETE FROM audits WHERE id IN (${AUDIT_N_ID}, ${AUDIT_N1_ID}, ${AUDIT_N2_ID}, ${AUDIT_N3_ID}, ${AUDIT_N4_ID})`.catch(
    () => {},
  );
  await client`DELETE FROM brands WHERE id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${TEST_ORG_ID}`.catch(() => {});
  await client.end();
});

describe("aggregate replace-set semantics (task #46 follow-up)", () => {
  it("a category present in audit N but absent from audit N+1 disappears from the aggregate after N+1", async () => {
    const { db } = await import("@/db/client");

    await seedCitations(AUDIT_N_ID, [
      // Task #46 (3rd follow-up): genuinely empty -> NO_CITATIONS_SOURCE_TYPE,
      // not "other" -- a response that cited nothing is zero citations,
      // not a phantom "other" one.
      { engine: "gemini", citedSources: [] },
      { engine: "claude", citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }] },
    ]);
    await buildCitationSourceIntelligence(db, AUDIT_N_ID, TEST_BRAND_ID, TEST_ORG_ID);

    let aggregate = await client`
      SELECT engine, source_type FROM citation_source_intelligence
      WHERE brand_id = ${TEST_BRAND_ID} AND audit_id IS NULL
    `;
    expect(
      aggregate.some((r) => r.engine === "gemini" && r.source_type === NO_CITATIONS_SOURCE_TYPE),
    ).toBe(true);
    expect(aggregate.some((r) => r.engine === "claude" && r.source_type === "au_directory")).toBe(
      true,
    );

    // Audit N+1: only claude/au_directory this time -- no gemini
    // citations at all.
    await seedCitations(AUDIT_N1_ID, [
      { engine: "claude", citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/b" }] },
    ]);
    await buildCitationSourceIntelligence(db, AUDIT_N1_ID, TEST_BRAND_ID, TEST_ORG_ID);

    aggregate = await client`
      SELECT engine, source_type FROM citation_source_intelligence
      WHERE brand_id = ${TEST_BRAND_ID} AND audit_id IS NULL
    `;
    // gemini/other is GONE -- not lingering with audit N's stale numbers.
    expect(aggregate.some((r) => r.engine === "gemini")).toBe(false);
    expect(aggregate).toHaveLength(1);
    expect(aggregate[0].engine).toBe("claude");
    expect(aggregate[0].source_type).toBe("au_directory");

    // Audit N's per-audit rows are untouched history.
    const auditNPerAudit = await client`
      SELECT engine FROM citation_source_intelligence WHERE audit_id = ${AUDIT_N_ID}
    `;
    expect(auditNPerAudit.some((r) => r.engine === "gemini")).toBe(true);
  });

  it("audit N+2 where every citation is non-empty-but-invalid: no real category for either engine, both show as NO_CITATIONS_SOURCE_TYPE -- read path surfaces those, not audit N+1's rows", async () => {
    const { db } = await import("@/db/client");

    // Every citation's citedSources is non-empty but entirely
    // unparseable -- no REAL CATEGORY group is ever created for this
    // audit, but (task #46 3rd follow-up, Part B) each engine still
    // gets its own honest "cited no sources" row, not silence. Gemini
    // gets 5 DISTINCT organic (run_number=1) responses -- 5 separate
    // seedCitations entries, each contributing its own run_number=1
    // row (plus 4 replay rows apiece, correctly excluded) -- not one
    // prompt's 5 replay-runs.
    await seedCitations(AUDIT_N2_ID, [
      ...Array.from({ length: 5 }, () => ({
        engine: "gemini",
        citedSources: [{ domain: "192.168.1.1", url: "https://192.168.1.1/x" }],
      })),
      { engine: "claude", citedSources: [{ domain: "192.168.1.2", url: "https://192.168.1.2/y" }] },
    ]);

    const result = await buildCitationSourceIntelligence(db, AUDIT_N2_ID, TEST_BRAND_ID, TEST_ORG_ID);
    expect(result.every((r) => r.sourceType === NO_CITATIONS_SOURCE_TYPE)).toBe(true);
    expect(result).toHaveLength(2); // one per engine

    const aggregate = await client`
      SELECT engine, source_type, citation_count FROM citation_source_intelligence
      WHERE brand_id = ${TEST_BRAND_ID} AND audit_id IS NULL
    `;
    expect(aggregate).toHaveLength(2);
    expect(aggregate.every((r) => r.source_type === NO_CITATIONS_SOURCE_TYPE)).toBe(true);
    expect(aggregate.find((r) => r.engine === "gemini")?.citation_count).toBe(5);

    // Read path: must NOT fall back to AUDIT_N1_ID's claude/au_directory
    // per-audit row -- the aggregate is non-empty (it holds the two
    // NO_CITATIONS_SOURCE_TYPE rows), so the normal aggregate-present
    // branch is used directly; AUDIT_N2_ID really is the brand's
    // latest completed audit, and it genuinely cited nothing real.
    const sources = await getCurrentCitationSources(db, TEST_BRAND_ID);
    expect(sources).toHaveLength(2);
    expect(sources.every((s) => s.sourceType === NO_CITATIONS_SOURCE_TYPE)).toBe(true);
  });

  it("an audit with literally zero organic citations recorded empties the aggregate entirely -- read path shows the empty state, not an older audit's rows", async () => {
    const { db } = await import("@/db/client");

    // No seedCitations call at all -- AUDIT_N4_ID has zero rows in
    // `citations`, the genuine "nothing recorded" edge case (as
    // opposed to N2's "recorded, but all invalid").
    const result = await buildCitationSourceIntelligence(db, AUDIT_N4_ID, TEST_BRAND_ID, TEST_ORG_ID);
    expect(result).toHaveLength(0);

    const aggregate = await client`
      SELECT * FROM citation_source_intelligence WHERE brand_id = ${TEST_BRAND_ID} AND audit_id IS NULL
    `;
    expect(aggregate).toHaveLength(0);

    // AUDIT_N4_ID is now the brand's actual latest completed audit
    // (seeded after N2 in beforeAll) and genuinely produced nothing
    // anywhere -- the read path must not fall back to N2's
    // NO_CITATIONS_SOURCE_TYPE rows (or any earlier audit's real rows).
    const sources = await getCurrentCitationSources(db, TEST_BRAND_ID);
    expect(sources).toHaveLength(0);
  });

  it("a forced failure during the replace leaves the aggregate with its previous complete set, while the new audit's per-audit rows still commit", async () => {
    const { db } = await import("@/db/client");

    // Re-establish a known-good aggregate baseline (audit N2 emptied
    // it above) -- reuse audit N1's seeding pattern as the "previous
    // complete set" this test protects.
    await client`DELETE FROM citation_source_intelligence WHERE brand_id = ${TEST_BRAND_ID} AND audit_id IS NULL`;
    await buildCitationSourceIntelligence(db, AUDIT_N1_ID, TEST_BRAND_ID, TEST_ORG_ID);
    const baseline = await client`
      SELECT engine, source_type, citation_count FROM citation_source_intelligence
      WHERE brand_id = ${TEST_BRAND_ID} AND audit_id IS NULL ORDER BY engine, source_type
    `;
    expect(baseline).toHaveLength(1); // claude/au_directory, count 1

    // Force the aggregate's INSERT half (audit_id IS NULL rows) to fail
    // on a real Postgres error, independent of top_domains -- the
    // per-audit insert (audit_id = a real uuid) is unaffected by this
    // constraint, so it isolates the aggregate-replace failure
    // specifically.
    // NOT VALID -- skips checking the EXISTING baseline row (which
    // legitimately has audit_id IS NULL), while still enforcing the
    // constraint against every new write from this point on.
    await client`ALTER TABLE citation_source_intelligence ADD CONSTRAINT temp_block_null_audit_id CHECK (audit_id IS NOT NULL) NOT VALID`;

    await seedCitations(AUDIT_N3_ID, [
      { engine: "claude", citedSources: [{ domain: "oneflare.com.au", url: "https://oneflare.com.au/c" }] },
    ]);
    const result = await buildCitationSourceIntelligence(db, AUDIT_N3_ID, TEST_BRAND_ID, TEST_ORG_ID);

    // Didn't throw.
    expect(result).toHaveLength(1);

    await client`ALTER TABLE citation_source_intelligence DROP CONSTRAINT temp_block_null_audit_id`;

    // The aggregate retains its PREVIOUS complete set -- the failed
    // replace's delete was rolled back by its own savepoint along with
    // the insert that triggered the failure, not left half-done.
    const aggregateAfter = await client`
      SELECT engine, source_type, citation_count FROM citation_source_intelligence
      WHERE brand_id = ${TEST_BRAND_ID} AND audit_id IS NULL ORDER BY engine, source_type
    `;
    expect(aggregateAfter).toEqual(baseline);

    // Audit N3's own per-audit row still committed -- the aggregate
    // failure didn't touch it.
    const perAuditN3 = await client`
      SELECT citation_count FROM citation_source_intelligence
      WHERE audit_id = ${AUDIT_N3_ID} AND source_type = 'au_directory'
    `;
    expect(perAuditN3).toHaveLength(1);
    expect(perAuditN3[0].citation_count).toBe(1);
  });
});
