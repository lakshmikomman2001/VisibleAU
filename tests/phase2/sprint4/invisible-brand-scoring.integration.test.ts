import { config } from "dotenv";
import { resolve } from "path";

// Must run before any import that transitively evaluates db/client.ts
// (which reads process.env.DATABASE_URL/SERVICE_DATABASE_URL at module-load
// time) — matching tests/integration/schema-drift.integration.test.ts's
// pattern, not relying on ./helpers/test-db's own config() running first via
// import order (fragile — Biome's organizeImports would happily re-sort the
// import block below and break that ordering).
config({ path: resolve(__dirname, "../../../.env.test.local") });

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { actionItems } from "@/db/schema/action-items";
import { citations } from "@/db/schema/citations";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { CONTEXT_SCORE_MAP, DIMENSION_WEIGHTS } from "@/lib/scoring/constants";
import { contextDimensionScore } from "@/lib/scoring/context";
import { audits, brands, organizations, seedOrganization, testDb } from "./helpers/test-db";

// ---------------------------------------------------------------------------
// K — invisible brands must score ~0, not 13.75.
//
// run-audit.ts and lib/audit/run-audit-inline.ts previously reimplemented
// sentiment/context aggregation inline with a broken empty-array fallback
// (: 50 / : 25), instead of using the already-correct, already-tested
// lib/scoring/{sentiment,context}.ts helpers (which return 0 for an empty
// label array — proven by tests/unit/scoring/composite.test.ts's
// "0%-mention brand scores exactly 0.00" test). This is the behavioural,
// end-to-end proof that the real orchestration function (not just the pure
// scoring functions in isolation) produces the fixed result: a brand
// mentioned in 0 of N calls gets a ~0 composite and "absent" context labels,
// while a brand that IS mentioned still gets its real, non-fallback score.
//
// Runs against the real DB via the real runAuditInline() — NODE_ENV=test
// under vitest makes getLLMService() return MockLLM automatically
// (lib/llm/index.ts), and the audit's own metadata.mockScenario selects
// deterministic fixtures: lib/llm/mock-responses/*/no_mention.json never
// names any brand; happy_path.json always names "Bondi Plumbing".
// ---------------------------------------------------------------------------

const TEST_PREFIX = `k-invisible-${Date.now()}`;
const createdOrgIds: string[] = [];

async function seedAuditReadyBrand(opts: {
  orgSuffix: string;
  brandName: string;
  mockScenario: "no_mention" | "happy_path";
}) {
  const org = await seedOrganization({
    clerkOrgId: `${TEST_PREFIX}-${opts.orgSuffix}`,
    name: `[K-TEST] ${opts.orgSuffix}`,
    tier: "free",
  });
  createdOrgIds.push(org.id);

  // Bypass vertical_packs entirely — brand.promptPack (>= PROMPTS_PER_AUDIT
  // entries) short-circuits getAuditPrompts(), keeping this test independent
  // of whatever vertical-pack seed state exists in this DB.
  const [brand] = await testDb
    .insert(brands)
    .values({
      organizationId: org.id,
      name: opts.brandName,
      domain: "example-test.com.au",
      vertical: "tradies",
      region: "au",
      competitors: [],
      primaryRegions: [],
      promptPack: Array.from({ length: 10 }, (_, i) => `Test prompt ${i + 1} for ${opts.brandName}`),
    })
    .returning();

  const [audit] = await testDb
    .insert(audits)
    .values({
      brandId: brand.id,
      organizationId: org.id,
      auditNumber: 1,
      triggeredBy: "manual",
      status: "pending",
      metadata: { mockScenario: opts.mockScenario },
    })
    .returning();

  return { org, brand, audit };
}

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    const orgAudits = await testDb.select({ id: audits.id }).from(audits).where(eq(audits.organizationId, orgId));
    for (const a of orgAudits) {
      await testDb.delete(citations).where(eq(citations.auditId, a.id));
      // run-audit-inline.ts's recommendation step can write action_items
      // rows keyed on audit_id — must clear those before the audit itself.
      await testDb.delete(actionItems).where(eq(actionItems.auditId, a.id));
    }
    await testDb.delete(audits).where(eq(audits.organizationId, orgId));
    await testDb.delete(brands).where(eq(brands.organizationId, orgId));
    await testDb.delete(organizations).where(eq(organizations.id, orgId));
  }
});

describe("K — invisible brand (0 of N mentions) scores ~0, not the old 13.75 floor", () => {
  it(
    "composite ≈ 0, context_label='absent' on every citation, score_context='absent'",
    async () => {
      const { brand, audit } = await seedAuditReadyBrand({
        orgSuffix: "invisible",
        brandName: "Totally Invisible Plumbing Co",
        mockScenario: "no_mention",
      });

      await runAuditInline(audit.id);

      const [result] = await testDb.select().from(audits).where(eq(audits.id, audit.id));
      expect(result.status).toBe("complete");
      expect(Number(result.scoreComposite)).toBeCloseTo(0, 1);
      expect(Number(result.scoreFrequency)).toBe(0);
      expect(Number(result.scorePosition)).toBe(0);
      expect(Number(result.scoreSentimentNumeric)).toBe(0);
      expect(Number(result.scoreContextNumeric)).toBe(0);
      expect(Number(result.scoreAccuracy)).toBe(0);
      expect(result.scoreContext).toBe("absent");

      const rows = await testDb.select().from(citations).where(eq(citations.auditId, audit.id));
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.brandMentioned).toBe(false);
        expect(row.contextLabel).toBe("absent");
        expect(row.contextLabel).not.toBe("mentioned");
      }

      void brand; // seeded only to satisfy the FK chain
    },
    30_000,
  );

  it(
    "a genuinely-mentioned brand still scores its real, non-fallback value",
    async () => {
      const { audit } = await seedAuditReadyBrand({
        orgSuffix: "visible",
        brandName: "Bondi Plumbing",
        mockScenario: "happy_path",
      });

      await runAuditInline(audit.id);

      const [result] = await testDb.select().from(audits).where(eq(audits.id, audit.id));
      expect(result.status).toBe("complete");
      // happy_path fixtures name the brand in every response — this must NOT
      // collapse to the same ~0 result as the invisible-brand case above.
      expect(Number(result.scoreComposite)).toBeGreaterThan(50);
      expect(Number(result.scoreFrequency)).toBeGreaterThan(0);
      expect(result.scoreContext).not.toBe("absent");

      const rows = await testDb.select().from(citations).where(eq(citations.auditId, audit.id));
      const mentioned = rows.filter((r) => r.brandMentioned);
      expect(mentioned.length).toBeGreaterThan(0);
      for (const row of mentioned) {
        expect(row.contextLabel).not.toBe("absent");
      }
    },
    30_000,
  );

  it("commodified context tier is untouched — still scores 25, not 0 (Round 29 canon)", () => {
    expect(CONTEXT_SCORE_MAP.commodified).toBe(25);
    expect(contextDimensionScore(["commodified", "commodified"])).toBe(25);
  });

  it("absent context tier scores 0 and does not affect the weight sum", () => {
    expect(CONTEXT_SCORE_MAP.absent).toBe(0);
    const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });
});
