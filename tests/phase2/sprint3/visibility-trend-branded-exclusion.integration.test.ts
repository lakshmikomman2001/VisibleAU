/**
 * ⚠️ DD — aggregateVisibilityTrend's Mention/Citation/archetype numbers must
 * exclude branded-prompt citations, the same scoping AA applied to Share of
 * Voice. Task CC found visibility-trend-aggregator.ts counted EVERY
 * citation with no is_branded_prompt filter -- a prompt that names the
 * brand directly ("Is {brand} reputable?") guarantees a trivial mention,
 * inflating mentionRate/citationRate and the archetype derived from them,
 * inconsistently with the now-honest SoV.
 *
 * Runs against the real DB via a direct postgres/drizzle client (same
 * pattern as tests/phase2/sprint4's invisible-brand-scoring test) rather
 * than a pure-function extraction -- the logic under test IS the SQL
 * aggregation (COUNT DISTINCT ... CASE WHEN), not something meaningfully
 * reproducible as a standalone JS function.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../../.env.test.local") });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { audits } from "@/db/schema/audits";
import { brands } from "@/db/schema/brands";
import { citations } from "@/db/schema/citations";
import { organizations } from "@/db/schema/organizations";
import { aggregateVisibilityTrend } from "@/lib/visibility/visibility-trend-aggregator";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const testDb = drizzle(client);

const TEST_PREFIX = `dd-branded-excl-${Date.now()}`;
const PERIOD_START = new Date("2026-01-01T00:00:00Z");
const PERIOD_END = new Date("2026-12-31T23:59:59Z");
const createdOrgIds: string[] = [];

async function seedBrandWithAudit(orgSuffix: string, brandDomain: string) {
  const [org] = await testDb
    .insert(organizations)
    .values({
      clerkOrgId: `${TEST_PREFIX}-${orgSuffix}`,
      name: `[DD-TEST] ${orgSuffix}`,
      region: "au",
    })
    .returning();
  createdOrgIds.push(org.id);

  const [brand] = await testDb
    .insert(brands)
    .values({
      organizationId: org.id,
      name: `DD Test Brand ${orgSuffix}`,
      domain: brandDomain,
      vertical: "tradies",
      region: "au",
      competitors: [],
      primaryRegions: [],
    })
    .returning();

  const [audit] = await testDb
    .insert(audits)
    .values({
      brandId: brand.id,
      organizationId: org.id,
      auditNumber: 1,
      status: "complete",
      completedAt: new Date("2026-06-15T00:00:00Z"),
    })
    .returning();

  return { org, brand, audit };
}

async function seedCitation(
  auditId: string,
  opts: {
    prompt: string;
    isBrandedPrompt: boolean | null;
    brandMentioned: boolean;
    citedBrandDomain?: string;
  },
) {
  await testDb.insert(citations).values({
    auditId,
    engine: "chatgpt",
    prompt: opts.prompt,
    brandMentioned: opts.brandMentioned,
    isBrandedPrompt: opts.isBrandedPrompt,
    citedSources: opts.citedBrandDomain ? [{ domain: opts.citedBrandDomain }] : [],
  });
}

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    const orgAudits = await testDb
      .select({ id: audits.id })
      .from(audits)
      .where(eq(audits.organizationId, orgId));
    for (const a of orgAudits) {
      await testDb.delete(citations).where(eq(citations.auditId, a.id));
    }
    await testDb.delete(audits).where(eq(audits.organizationId, orgId));
    await testDb.delete(brands).where(eq(brands.organizationId, orgId));
    await testDb.delete(organizations).where(eq(organizations.id, orgId));
  }
  await client.end();
});

describe("⚠️ DD — aggregateVisibilityTrend excludes branded-prompt citations", () => {
  it("totalPrompts/mentionedPrompts/citedPrompts all exclude branded rows -- organic rate only", async () => {
    const brandDomain = "dd-citdom.example.com.au";
    const { brand, org, audit } = await seedBrandWithAudit("mixed", brandDomain);

    // 3 branded rows -- a guaranteed self-mention (and one self-citation),
    // and one branded-but-not-mentioned row. All three must be fully
    // excluded from every count, not just the "mentioned" numerator.
    await seedCitation(audit.id, { prompt: "p-br-1", isBrandedPrompt: true, brandMentioned: true });
    await seedCitation(audit.id, {
      prompt: "p-br-2",
      isBrandedPrompt: true,
      brandMentioned: true,
      citedBrandDomain: brandDomain,
    });
    await seedCitation(audit.id, { prompt: "p-br-3", isBrandedPrompt: true, brandMentioned: false });

    // 5 neutral rows -- 3 mentioned (2 plain + 1 self-cited), 2 not.
    await seedCitation(audit.id, { prompt: "p-n-1", isBrandedPrompt: false, brandMentioned: true });
    await seedCitation(audit.id, {
      prompt: "p-n-2",
      isBrandedPrompt: false,
      brandMentioned: true,
      citedBrandDomain: brandDomain,
    });
    await seedCitation(audit.id, { prompt: "p-n-3", isBrandedPrompt: false, brandMentioned: false });
    await seedCitation(audit.id, { prompt: "p-n-4", isBrandedPrompt: false, brandMentioned: false });
    await seedCitation(audit.id, { prompt: "p-n-5", isBrandedPrompt: false, brandMentioned: false });

    // 2 legacy rows (isBrandedPrompt NULL, written before the column
    // existed) -- treated as not-branded, same as AA's pattern, so these
    // count toward the organic pool too.
    await seedCitation(audit.id, { prompt: "p-legacy-1", isBrandedPrompt: null, brandMentioned: true });
    await seedCitation(audit.id, {
      prompt: "p-legacy-2",
      isBrandedPrompt: null,
      brandMentioned: false,
    });

    const result = await aggregateVisibilityTrend(testDb as never, {
      brandId: brand.id,
      organizationId: org.id,
      periodLabel: "2026-test",
      periodType: "monthly",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      brandDomain,
    });

    // Organic pool: 5 neutral + 2 legacy = 7 rows. Mentioned: p-n-1, p-n-2,
    // p-legacy-1 = 3. Cited (self-domain in citedSources): p-n-2 = 1.
    // If branded rows leaked in, totalPrompts would be 10, mentionRate 50,
    // citationRate 20 (p-br-2 + p-n-2) -- the exact pre-fix inflation.
    expect(result.mentionRate).toBeCloseTo((3 / 7) * 100, 1);
    expect(result.citationRate).toBeCloseTo((1 / 7) * 100, 1);
    expect(result.mentionRate).not.toBeCloseTo(50, 0);
    expect(result.citationRate).not.toBeCloseTo(20, 0);
  });

  it("a brand mentioned ONLY via branded prompts -> mentionRate 0, no divide-by-zero (all-branded edge case)", async () => {
    const brandDomain = "dd-onlybranded.example.com.au";
    const { brand, org, audit } = await seedBrandWithAudit("only-branded", brandDomain);

    await seedCitation(audit.id, { prompt: "ob-1", isBrandedPrompt: true, brandMentioned: true });
    await seedCitation(audit.id, { prompt: "ob-2", isBrandedPrompt: true, brandMentioned: true });

    const result = await aggregateVisibilityTrend(testDb as never, {
      brandId: brand.id,
      organizationId: org.id,
      periodLabel: "2026-test",
      periodType: "monthly",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      brandDomain,
    });

    // Every citation excluded -> totalPrompts 0 -> guarded to 0, never NaN
    // or a fabricated 100% from a 0/0 division.
    expect(result.mentionRate).toBe(0);
    expect(result.citationRate).toBe(0);
    expect(Number.isNaN(result.mentionRate)).toBe(false);
  });

  it("consistency with SoV: both exclude is_branded_prompt = true, keep NULL/false", () => {
    const { readFileSync } = require("fs");
    const source = readFileSync("lib/visibility/visibility-trend-aggregator.ts", "utf-8");
    const sovSource = readFileSync("lib/visibility/sov-calculator.ts", "utf-8");
    expect(source).toContain("IS NOT TRUE");
    expect(sovSource).toContain("isBrandedPrompt === true");
  });
});
