/**
 * Vunnara (21 Oct), item 2 -- real-DB proof that lib/audit/run-audit-
 * inline.ts's own actionItems insert persists confidence_basis, closing
 * a confirmed drift from inngest/functions/generate-recommendations.ts
 * (which always wrote it). Before this fix, every recommendation
 * generated through THIS runner -- every sample audit, and any real
 * audit whose Inngest send happens to fail (app/api/audits/route.ts's
 * own fallback) -- stored confidence_basis = NULL regardless of
 * whether a real checker ran, indistinguishable by that column alone
 * from a genuinely legacy, pre-evidence row (lib/recommendations/
 * confidence-labels.ts's isLegacyConfidence).
 *
 * Mocks the one remaining network-calling evidence checker
 * (deterministic, no real fetch to Wikipedia) -- the LLM layer is
 * already routed to the mock implementation globally (LLM_MODE=mock,
 * .env.test.local). Vunnara (21 Oct, "directory listings... never
 * scraping", Part E): directory-visibility's own evidence (Part D's
 * real citation count, via productionCheckers' real DB-backed
 * getDirectoryCitations) is NOT mocked here -- it runs for real against
 * this test's brand/audit, correctly finds zero citations (a synthetic
 * audit with no citations rows yet) and so never fires, same as before
 * this rule existed. This test still proves confidence_basis persistence
 * via entity-profiles (the Wikipedia checker), the other rule whose
 * ceiling is "confirmed". ⚠️ DEV/TEST DB ONLY.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/brand-entity/wikipedia-au", () => ({
  checkWikipediaAuStatus: vi.fn().mockResolvedValue({
    status: "not_found",
    query: "Confidence Basis Test Co Australia",
  }),
}));

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier, region)
    VALUES (${ORG_ID}, ${`cb-org-${ORG_ID}`}, 'Confidence Basis Test Org', ${`cb-org-${ORG_ID}`}, 'free', 'au')
  `;
  // classification must be a real, non-null BrandClassification JSON --
  // lib/prompts/regenerate-prompt-pack.ts no-ops (no write, no throw)
  // for a null classification, which leaves promptPackGeneratorVersion
  // stale and makes get-audit-prompts.ts throw PromptPackGenerationError
  // (swallowed by run-audit-inline.ts's own catch, silently producing
  // zero action_items -- not the bug this test is proving). location_mode
  // is a real enum ("fixed" | "online_only"), not a free string.
  const classification = {
    category: "trades_general",
    buyerType: "smb",
    audience: "households",
    intentSignals: [],
    competitors: [],
    auRelevance: "au_strong",
    confidence: 0.9,
  };
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors,
      classification_status, classification, category_confirmed_at, categories, audience, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Confidence Basis Test Co', ${`cbtest-${randomUUID()}.example.com.au`}, 'tradies', 'au',
      ARRAY['NSW:Sydney'], ARRAY[]::text[], 'complete', ${client.json(classification)}, now(), ARRAY['trades_general'], 'households', 'fixed')
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, triggered_by)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'pending', 'manual')
  `;
});

afterAll(async () => {
  await client`DELETE FROM action_items WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("run-audit-inline.ts -- confidence_basis is persisted on every generated recommendation", () => {
  it("a 'confirmed' recommendation (real checker evidence) stores confidence_basis = 'verified', never NULL", async () => {
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
    await runAuditInline(AUDIT_ID);

    const rows = await client`
      SELECT recommendation_key, confidence_label, confidence_basis
      FROM action_items
      WHERE audit_id = ${AUDIT_ID}
    `;
    expect(rows.length).toBeGreaterThan(0);

    const entityProfiles = rows.find((r) => r.recommendation_key === "entity-profiles");
    expect(entityProfiles?.confidence_label).toBe("confirmed");
    // The bug this fix closes: this used to always read NULL here,
    // regardless of confidence_label, making a genuinely evidence-backed
    // row indistinguishable from a legacy pre-evidence one.
    expect(entityProfiles?.confidence_basis).toBe("verified");

    // Every row this runner writes has a real basis, not just the one
    // directly asserted above -- confirms the fix applies to the whole
    // insert, not one coincidentally-matching row.
    for (const row of rows) {
      expect(row.confidence_basis, row.recommendation_key).not.toBeNull();
    }
  });
});
