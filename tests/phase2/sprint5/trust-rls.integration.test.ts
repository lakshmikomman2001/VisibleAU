import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

const ORG_A_ID = "a0a0a0a0-0000-0000-0000-000000000001";
const ORG_B_ID = "b0b0b0b0-0000-0000-0000-000000000002";
const BRAND_A_ID = "a0a0a0a0-1111-0000-0000-000000000001";
const BRAND_B_ID = "b0b0b0b0-1111-0000-0000-000000000002";
const AUDIT_A_ID = "a0a0a0a0-2222-0000-0000-000000000001";

const TRUST_TABLES = [
  "hallucination_incidents",
  "evidence_snapshots",
  "brand_consensus_checks",
  "citation_source_intelligence",
  "linkedin_presence_audits",
  "youtube_presence_audits",
] as const;

let superClient: ReturnType<typeof postgres>;
let rlsClient: ReturnType<typeof postgres>;

beforeAll(async () => {
  superClient = postgres(TEST_DB_URL, { max: 1 });

  await superClient`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_role') THEN
        CREATE ROLE rls_test_role LOGIN PASSWORD 'rls_test_pass';
      END IF;
    END $$
  `;

  await superClient`GRANT USAGE ON SCHEMA public TO rls_test_role`;
  for (const table of [
    ...TRUST_TABLES,
    "brand_entity_scores",
    "brands",
    "organizations",
    "audits",
  ]) {
    await superClient`GRANT SELECT, INSERT, UPDATE, DELETE ON ${superClient(table)} TO rls_test_role`;
  }

  // Seed two orgs → two brands → one audit (for FK)
  await superClient`
    INSERT INTO organizations (id, clerk_org_id, name)
    VALUES
      (${ORG_A_ID}, 'rls_test_org_a', 'RLS Test Org A'),
      (${ORG_B_ID}, 'rls_test_org_b', 'RLS Test Org B')
    ON CONFLICT (id) DO NOTHING
  `;
  await superClient`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region)
    VALUES
      (${BRAND_A_ID}, ${ORG_A_ID}, 'Brand A', 'branda.test', 'tradies', 'au'),
      (${BRAND_B_ID}, ${ORG_B_ID}, 'Brand B', 'brandb.test', 'tradies', 'au')
    ON CONFLICT (id) DO NOTHING
  `;
  await superClient`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, engines)
    VALUES (${AUDIT_A_ID}, ${BRAND_A_ID}, ${ORG_A_ID}, 99999, ARRAY['chatgpt'])
    ON CONFLICT (id) DO NOTHING
  `;

  // Seed rows in all 6 direct-org_id trust tables for BOTH orgs
  await superClient`
    INSERT INTO hallucination_incidents (brand_id, organization_id, engine, prompt, incorrect_claim, claim_type, severity)
    VALUES
      (${BRAND_A_ID}, ${ORG_A_ID}, 'chatgpt', 'test prompt A', 'claim A', 'wrong_fact', 'critical'),
      (${BRAND_B_ID}, ${ORG_B_ID}, 'chatgpt', 'test prompt B', 'claim B', 'wrong_fact', 'warning')
  `;
  await superClient`
    INSERT INTO evidence_snapshots (brand_id, organization_id, engine, prompt, raw_response)
    VALUES
      (${BRAND_A_ID}, ${ORG_A_ID}, 'chatgpt', 'evidence prompt A', 'response A'),
      (${BRAND_B_ID}, ${ORG_B_ID}, 'chatgpt', 'evidence prompt B', 'response B')
  `;
  await superClient`
    INSERT INTO brand_consensus_checks (brand_id, organization_id, source_type)
    VALUES
      (${BRAND_A_ID}, ${ORG_A_ID}, 'website'),
      (${BRAND_B_ID}, ${ORG_B_ID}, 'linkedin')
  `;
  await superClient`
    INSERT INTO citation_source_intelligence (brand_id, organization_id, engine, source_type, citation_count, brand_present_in_source, gap_severity)
    VALUES
      (${BRAND_A_ID}, ${ORG_A_ID}, 'chatgpt', 'reddit_thread', 5, true, 'none'),
      (${BRAND_B_ID}, ${ORG_B_ID}, 'chatgpt', 'news_article', 3, false, 'critical')
  `;
  await superClient`
    INSERT INTO linkedin_presence_audits (brand_id, organization_id)
    VALUES
      (${BRAND_A_ID}, ${ORG_A_ID}),
      (${BRAND_B_ID}, ${ORG_B_ID})
  `;
  await superClient`
    INSERT INTO youtube_presence_audits (brand_id, organization_id)
    VALUES
      (${BRAND_A_ID}, ${ORG_A_ID}),
      (${BRAND_B_ID}, ${ORG_B_ID})
  `;

  // Seed brand_entity_scores for both brands (no organization_id for RLS — uses brand-join)
  await superClient`
    INSERT INTO brand_entity_scores (brand_id, organization_id)
    VALUES
      (${BRAND_A_ID}, ${ORG_A_ID}),
      (${BRAND_B_ID}, ${ORG_B_ID})
  `;

  rlsClient = postgres(TEST_DB_URL.replace("postgres:password", "rls_test_role:rls_test_pass"), {
    max: 1,
  });
});

afterAll(async () => {
  if (rlsClient) await rlsClient.end();

  if (superClient) {
    // Clean up in reverse FK order
    await superClient`DELETE FROM brand_entity_scores WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})`.catch(() => {});
    for (const table of TRUST_TABLES) {
      await superClient`DELETE FROM ${superClient(table)} WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})`.catch(() => {});
    }
    await superClient`DELETE FROM audits WHERE id = ${AUDIT_A_ID}`.catch(() => {});
    await superClient`DELETE FROM brands WHERE id IN (${BRAND_A_ID}, ${BRAND_B_ID})`.catch(() => {});
    await superClient`DELETE FROM organizations WHERE id IN (${ORG_A_ID}, ${ORG_B_ID})`.catch(() => {});
    await superClient.end();
  }
});

// ──────────────────────────────────────────────
// READ isolation: 6 direct-org_id trust tables
// ──────────────────────────────────────────────
describe("Trust RLS: READ isolation (USING policy)", () => {
  for (const table of TRUST_TABLES) {
    it(`${table}: org A context sees only org A rows`, async () => {
      await rlsClient`SELECT set_config('app.current_org_id', ${ORG_A_ID}, false)`;
      const rows = await rlsClient`
        SELECT organization_id FROM ${rlsClient(table)}
        WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})
      `;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.organization_id === ORG_A_ID)).toBe(true);
    });

    it(`${table}: org B context sees only org B rows`, async () => {
      await rlsClient`SELECT set_config('app.current_org_id', ${ORG_B_ID}, false)`;
      const rows = await rlsClient`
        SELECT organization_id FROM ${rlsClient(table)}
        WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})
      `;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.organization_id === ORG_B_ID)).toBe(true);
    });

    it(`${table}: bogus org context sees 0 rows`, async () => {
      await rlsClient`SELECT set_config('app.current_org_id', '00000000-0000-0000-0000-000000000000', false)`;
      const rows = await rlsClient`
        SELECT id FROM ${rlsClient(table)}
        WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})
      `;
      expect(rows).toHaveLength(0);
    });
  }
});

// ──────────────────────────────────────────────
// INSERT block: WITH CHECK on 6 direct-org_id tables
// ──────────────────────────────────────────────
describe("Trust RLS: INSERT block (WITH CHECK policy)", () => {
  it("hallucination_incidents: insert for other org blocked", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${ORG_A_ID}, false)`;
    await expect(
      rlsClient`
        INSERT INTO hallucination_incidents (brand_id, organization_id, engine, prompt, incorrect_claim, claim_type, severity)
        VALUES (${BRAND_B_ID}, ${ORG_B_ID}, 'chatgpt', 'rls block test', 'fake', 'wrong_fact', 'info')
      `,
    ).rejects.toThrow();
  });

  it("evidence_snapshots: insert for other org blocked", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${ORG_A_ID}, false)`;
    await expect(
      rlsClient`
        INSERT INTO evidence_snapshots (brand_id, organization_id, engine, prompt, raw_response)
        VALUES (${BRAND_B_ID}, ${ORG_B_ID}, 'chatgpt', 'rls block test', 'resp')
      `,
    ).rejects.toThrow();
  });

  it("brand_consensus_checks: insert for other org blocked", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${ORG_A_ID}, false)`;
    await expect(
      rlsClient`
        INSERT INTO brand_consensus_checks (brand_id, organization_id, source_type)
        VALUES (${BRAND_B_ID}, ${ORG_B_ID}, 'rls_block_test')
      `,
    ).rejects.toThrow();
  });

  it("citation_source_intelligence: insert for other org blocked", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${ORG_A_ID}, false)`;
    await expect(
      rlsClient`
        INSERT INTO citation_source_intelligence (brand_id, organization_id, engine, source_type, citation_count, brand_present_in_source, gap_severity)
        VALUES (${BRAND_B_ID}, ${ORG_B_ID}, 'chatgpt', 'test', 0, false, 'none')
      `,
    ).rejects.toThrow();
  });

  it("linkedin_presence_audits: insert for other org blocked", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${ORG_A_ID}, false)`;
    await expect(
      rlsClient`
        INSERT INTO linkedin_presence_audits (brand_id, organization_id)
        VALUES (${BRAND_B_ID}, ${ORG_B_ID})
      `,
    ).rejects.toThrow();
  });

  it("youtube_presence_audits: insert for other org blocked", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${ORG_A_ID}, false)`;
    await expect(
      rlsClient`
        INSERT INTO youtube_presence_audits (brand_id, organization_id)
        VALUES (${BRAND_B_ID}, ${ORG_B_ID})
      `,
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────
// brand_entity_scores: JOIN-to-brands posture (§5.9)
// ──────────────────────────────────────────────
describe("Trust RLS: brand_entity_scores (brand-join policy)", () => {
  it("org A context sees only org A brand entity rows", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${ORG_A_ID}, false)`;
    const rows = await rlsClient`
      SELECT brand_id FROM brand_entity_scores
      WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})
    `;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.brand_id === BRAND_A_ID)).toBe(true);
  });

  it("org B context sees only org B brand entity rows", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${ORG_B_ID}, false)`;
    const rows = await rlsClient`
      SELECT brand_id FROM brand_entity_scores
      WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})
    `;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.brand_id === BRAND_B_ID)).toBe(true);
  });

  it("bogus org context sees 0 entity rows", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', '00000000-0000-0000-0000-000000000000', false)`;
    const rows = await rlsClient`
      SELECT id FROM brand_entity_scores
      WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})
    `;
    expect(rows).toHaveLength(0);
  });

  it("insert for other org's brand blocked (WITH CHECK via brand-join)", async () => {
    await rlsClient`SELECT set_config('app.current_org_id', ${ORG_A_ID}, false)`;
    await expect(
      rlsClient`
        INSERT INTO brand_entity_scores (brand_id, organization_id)
        VALUES (${BRAND_B_ID}, ${ORG_B_ID})
      `,
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────
// Superuser bypass: confirms the test data exists
// (proves RLS is filtering, not missing data)
// ──────────────────────────────────────────────
describe("Trust RLS: superuser bypass (control group)", () => {
  it("superuser sees rows from BOTH orgs in hallucination_incidents", async () => {
    const rows = await superClient`
      SELECT DISTINCT organization_id FROM hallucination_incidents
      WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})
    `;
    const orgIds = rows.map((r) => r.organization_id);
    expect(orgIds).toContain(ORG_A_ID);
    expect(orgIds).toContain(ORG_B_ID);
  });

  it("superuser sees rows from BOTH orgs in brand_entity_scores", async () => {
    const rows = await superClient`
      SELECT DISTINCT brand_id FROM brand_entity_scores
      WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})
    `;
    expect(rows).toHaveLength(2);
  });
});
