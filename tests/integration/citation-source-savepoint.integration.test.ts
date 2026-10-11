/**
 * Task #45 follow-up ("BEFORE pushing 17974b3"): buildCitationSourceIntelligence's
 * writes are non-fatal (try/catch + retry), proven so far only against
 * mocks. Two real-Postgres risks mocks can't catch:
 *
 * 1. Drizzle's single-row `.insert(table).values({})` emits EVERY
 *    column the table object declares, using `default` for anything
 *    the caller omitted -- omitting the `topDomains` KEY from the JS
 *    object does NOT omit "top_domains" from the generated SQL. The
 *    "retry without it" fallback, as originally written, referenced
 *    the exact same dropped column on its retry and failed identically.
 * 2. In Postgres, ANY failed statement poisons the enclosing
 *    transaction until ROLLBACK -- a try/catch around a failed
 *    statement does not un-poison it. Today's two real callers (the
 *    Inngest function via serviceDb, and these integration tests via
 *    the plain db client) never pass an already-open transaction, so
 *    this specific failure mode has never actually bitten -- but the
 *    function's own `DbClient = typeof db | TxClient` signature
 *    explicitly allows a future caller to pass one.
 *
 * Fixed by: a second, file-local table descriptor
 * (citationSourceIntelligenceNoTopDomains in
 * lib/trust/citation-intelligence.ts) that genuinely has no
 * top_domains column for the retry to reference, and wrapping each
 * guarded write in tx.transaction() (a SAVEPOINT when nested, a fresh
 * standalone transaction otherwise). See
 * docs/ops/post-launch-db-hardening.md section 45.
 */
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCitationSourceIntelligence } from "@/lib/trust/citation-intelligence";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
const TEST_ORG_ID = "66005fa1-6666-4ccc-8ddd-000000000001";
const TEST_BRAND_ID = "66005fa1-6666-4ccc-8ddd-000000000002";
const AUDIT_ID = "66005fa1-6666-4ccc-8ddd-000000000003";
const AUDIT_ID_NO_TX = "66005fa1-6666-4ccc-8ddd-000000000004";

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = TEST_DB_URL;
  client = postgres(TEST_DB_URL, { max: 1 });

  await client`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${TEST_ORG_ID}, 'csi-savepoint-clerk', 'CSI Savepoint Org', 'csi-savepoint') ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions) VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'CSI Savepoint Brand', 'bondiplumbing.com.au', 'tradies', 'au', ARRAY['NSW:Sydney']) ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, completed_at) VALUES (${AUDIT_ID}, ${TEST_BRAND_ID}, ${TEST_ORG_ID}, 401, 'complete', ARRAY['chatgpt'], NOW()) ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, completed_at) VALUES (${AUDIT_ID_NO_TX}, ${TEST_BRAND_ID}, ${TEST_ORG_ID}, 402, 'complete', ARRAY['chatgpt'], NOW()) ON CONFLICT (id) DO NOTHING`;

  for (const auditId of [AUDIT_ID, AUDIT_ID_NO_TX]) {
    for (let run = 1; run <= 5; run++) {
      await client`
        INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources)
        VALUES (${auditId}, 'chatgpt', 'Savepoint prompt', ${run}, false, false, ${JSON.stringify([
          { domain: "someplumber.com.au", url: "https://someplumber.com.au/" },
        ])})
      `;
    }
  }

  // The real pre-apply-0044 scenario: migration 0039 hasn't run yet on
  // whatever database this is. Stays dropped for every test in this
  // file -- only restored once, in afterAll -- so verification below
  // uses raw SQL selecting specific columns rather than the full
  // citationSourceIntelligence table object (which always selects
  // every column, including the dropped one).
  await client`ALTER TABLE citation_source_intelligence DROP COLUMN IF EXISTS top_domains`;
});

afterAll(async () => {
  await client`ALTER TABLE citation_source_intelligence ADD COLUMN IF NOT EXISTS top_domains jsonb`.catch(
    () => {},
  );
  await client`DELETE FROM citation_source_intelligence WHERE brand_id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM citations WHERE audit_id IN (${AUDIT_ID}, ${AUDIT_ID_NO_TX})`.catch(() => {});
  await client`DELETE FROM audits WHERE id IN (${AUDIT_ID}, ${AUDIT_ID_NO_TX})`.catch(() => {});
  await client`DELETE FROM brands WHERE id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${TEST_ORG_ID}`.catch(() => {});
  await client.end();
});

describe("buildCitationSourceIntelligence inside an already-open transaction: a forced real-Postgres failure is savepoint-contained", () => {
  it("an unrelated write made earlier in the SAME outer transaction survives, and the retry-without-topDomains still succeeds", async () => {
    const { db } = await import("@/db/client");

    await db.transaction(async (tx) => {
      // A write that has nothing to do with buildCitationSourceIntelligence's
      // own guarded writes -- must survive regardless of what happens
      // later in this same transaction. Raw SQL naming only the columns
      // that exist with top_domains dropped (the real
      // citationSourceIntelligence table object would, like the bug
      // this test exists to catch, reference top_domains regardless of
      // which keys .values() is given -- see the NoTopDomains comment
      // in lib/trust/citation-intelligence.ts).
      await tx.execute(sql`
        INSERT INTO citation_source_intelligence
          (brand_id, organization_id, audit_id, engine, source_type, citation_count, citation_share, brand_present_in_source, gap_severity)
        VALUES
          (${TEST_BRAND_ID}, ${TEST_ORG_ID}, ${AUDIT_ID}, 'chatgpt', 'sentinel_marker', 1, '100', false, 'unclassified')
      `);

      // top_domains is dropped -- every insert/upsert this makes will
      // fail on its first (with-topDomains) attempt and must retry.
      await buildCitationSourceIntelligence(tx, AUDIT_ID, TEST_BRAND_ID, TEST_ORG_ID);
    });

    const sentinel = await client`
      SELECT id FROM citation_source_intelligence
      WHERE audit_id = ${AUDIT_ID} AND source_type = 'sentinel_marker'
    `;
    expect(sentinel).toHaveLength(1); // not silently rolled back by the later failure

    const otherRow = await client`
      SELECT citation_count FROM citation_source_intelligence
      WHERE audit_id = ${AUDIT_ID} AND source_type = 'other'
    `;
    expect(otherRow).toHaveLength(1); // the retry-without-topDomains succeeded too
    expect(otherRow[0].citation_count).toBe(1);

    const aggregateRow = await client`
      SELECT audit_id FROM citation_source_intelligence
      WHERE brand_id = ${TEST_BRAND_ID} AND source_type = 'other' AND audit_id IS NULL
    `;
    // The aggregate row (auditId IS NULL) also made it through, on top
    // of the per-audit row checked above.
    expect(aggregateRow).toHaveLength(1);
  });
});

describe("buildCitationSourceIntelligence with a plain (non-transactional) client -- today's actual two real callers", () => {
  it("still writes the row (without topDomains) when the column is missing -- not just 'doesn't crash'", async () => {
    const { db } = await import("@/db/client");

    // top_domains is still dropped from the beforeAll above. No active
    // transaction here at all -- this is exactly how the Inngest
    // function (serviceDb) and these integration tests (plain db) call
    // this function today.
    const result = await buildCitationSourceIntelligence(db, AUDIT_ID_NO_TX, TEST_BRAND_ID, TEST_ORG_ID);
    expect(result).toHaveLength(1);

    const row = await client`
      SELECT citation_count FROM citation_source_intelligence
      WHERE audit_id = ${AUDIT_ID_NO_TX} AND source_type = 'other'
    `;
    // Before the fix, this would be empty: Drizzle's .values({}) always
    // emits every schema column, so omitting the topDomains KEY never
    // stopped the retry from referencing the dropped column either --
    // the row would silently never get written, even with no
    // transaction involved at all.
    expect(row).toHaveLength(1);
    expect(row[0].citation_count).toBe(1);
  });
});
