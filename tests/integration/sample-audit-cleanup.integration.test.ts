/**
 * Audit reliability, Part C, item 7 -- real-DB proof that the nightly
 * sampleAuditCleanup job fully removes an old __sample__ brand and
 * EVERY child row across it (citations, engine_call_failures,
 * action_items, drift_alerts), despite their NO ACTION foreign keys,
 * and that it never touches a real org's brand even when that brand
 * has the exact same child-row shape (same old createdAt, an action
 * item, a drift alert). ⚠️ DEV/TEST DB ONLY.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../.env.test.local") });

import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { serviceDb } from "@/db/client";
import { actionItems } from "@/db/schema/action-items";
import { audits } from "@/db/schema/audits";
import { brands } from "@/db/schema/brands";
import { citations } from "@/db/schema/citations";
import { driftAlerts } from "@/db/schema/drift-alerts";
import { engineCallFailures } from "@/db/schema/engine-call-failures";
import { organizations } from "@/db/schema/organizations";
import { ensureSampleOrg } from "@/lib/sample-audit/synthetic-org";

const step = { run: (_name: string, fn: () => unknown) => fn() };
const TEST_PREFIX = `cleanup-${Date.now()}`;
const OLD_CREATED_AT = new Date(Date.now() - 48 * 60 * 60 * 1000); // past the job's 24h cutoff

const createdRealOrgIds: string[] = [];

async function seedBrandWithFullChildRowSet(opts: { organizationId: string; suffix: string }) {
  const [brand] = await serviceDb
    .insert(brands)
    .values({
      organizationId: opts.organizationId,
      name: `Cleanup Test Brand ${opts.suffix}`,
      domain: `${TEST_PREFIX}-${opts.suffix}.example.com.au`,
      vertical: "tradies",
      region: "au",
      competitors: [],
      primaryRegions: [],
    })
    .returning();

  const [audit1] = await serviceDb
    .insert(audits)
    .values({
      brandId: brand.id,
      organizationId: opts.organizationId,
      auditNumber: 1,
      triggeredBy: "manual",
      status: "complete",
      createdAt: OLD_CREATED_AT,
    })
    .returning();
  const [audit2] = await serviceDb
    .insert(audits)
    .values({
      brandId: brand.id,
      organizationId: opts.organizationId,
      auditNumber: 2,
      triggeredBy: "manual",
      status: "complete",
      createdAt: OLD_CREATED_AT,
    })
    .returning();

  await serviceDb.insert(citations).values({
    auditId: audit1.id,
    engine: "chatgpt",
    prompt: "test prompt",
    brandMentioned: true,
  });

  await serviceDb.insert(engineCallFailures).values({
    auditId: audit1.id,
    organizationId: opts.organizationId,
    engine: "chatgpt",
    prompt: "test prompt 2",
    isBrandedPrompt: false,
    errorClass: "timeout",
    attempts: 1,
    latencyMs: 100,
  });

  await serviceDb.insert(actionItems).values({
    organizationId: opts.organizationId,
    brandId: brand.id,
    auditId: audit1.id,
    recommendationKey: "test_rec",
    dimension: "frequency",
    title: "Test recommendation",
    action: "Do the thing",
    confidenceLabel: "inferred",
    expectedImpactScore: "medium",
  });

  await serviceDb.insert(driftAlerts).values({
    organizationId: opts.organizationId,
    brandId: brand.id,
    currentAuditId: audit1.id,
    previousAuditId: audit2.id,
    severity: "moderate",
  });

  return { brand, auditIds: [audit1.id, audit2.id] };
}

async function childRowCounts(brandId: string, auditIds: string[]) {
  const [brandRows, auditRows, citationRows, failureRows, actionRows, driftRows] = await Promise.all([
    serviceDb.select().from(brands).where(eq(brands.id, brandId)),
    serviceDb.select().from(audits).where(inArray(audits.id, auditIds)),
    serviceDb.select().from(citations).where(inArray(citations.auditId, auditIds)),
    serviceDb.select().from(engineCallFailures).where(inArray(engineCallFailures.auditId, auditIds)),
    serviceDb.select().from(actionItems).where(inArray(actionItems.auditId, auditIds)),
    serviceDb.select().from(driftAlerts).where(inArray(driftAlerts.currentAuditId, auditIds)),
  ]);
  return {
    brand: brandRows.length,
    audits: auditRows.length,
    citations: citationRows.length,
    failures: failureRows.length,
    actionItems: actionRows.length,
    driftAlerts: driftRows.length,
  };
}

afterAll(async () => {
  for (const orgId of createdRealOrgIds) {
    const orgBrands = await serviceDb.select({ id: brands.id }).from(brands).where(eq(brands.organizationId, orgId));
    for (const b of orgBrands) {
      const brandAudits = await serviceDb.select({ id: audits.id }).from(audits).where(eq(audits.brandId, b.id));
      const auditIds = brandAudits.map((a) => a.id);
      if (auditIds.length > 0) {
        await serviceDb.delete(actionItems).where(inArray(actionItems.auditId, auditIds));
        await serviceDb.delete(driftAlerts).where(inArray(driftAlerts.currentAuditId, auditIds));
        await serviceDb.delete(driftAlerts).where(inArray(driftAlerts.previousAuditId, auditIds));
        await serviceDb.delete(engineCallFailures).where(inArray(engineCallFailures.auditId, auditIds));
        await serviceDb.delete(citations).where(inArray(citations.auditId, auditIds));
        await serviceDb.delete(audits).where(inArray(audits.id, auditIds));
      }
    }
    await serviceDb.delete(brands).where(eq(brands.organizationId, orgId));
    await serviceDb.delete(organizations).where(eq(organizations.id, orgId));
  }
});

describe("sampleAuditCleanup -- full child-row removal, scoped hard to __sample__", () => {
  it(
    "a sample brand with an action item and a drift alert is fully removed; a real org's brand with the same data is untouched",
    async () => {
      const sampleOrg = await ensureSampleOrg();

      const [realOrg] = await serviceDb
        .insert(organizations)
        .values({ clerkOrgId: `${TEST_PREFIX}-real`, name: "[cleanup test] real org", slug: `${TEST_PREFIX}-real` })
        .returning();
      createdRealOrgIds.push(realOrg.id);

      const { brand: sampleBrand, auditIds: sampleAuditIds } = await seedBrandWithFullChildRowSet({
        organizationId: sampleOrg.id,
        suffix: "sample",
      });
      const { brand: realBrand, auditIds: realAuditIds } = await seedBrandWithFullChildRowSet({
        organizationId: realOrg.id,
        suffix: "real",
      });

      const before = await childRowCounts(sampleBrand.id, sampleAuditIds);
      expect(before).toEqual({ brand: 1, audits: 2, citations: 1, failures: 1, actionItems: 1, driftAlerts: 1 });

      const { sampleAuditCleanup } = await import("@/inngest/functions/sample-audit-cleanup");
      type Handler = (ctx: { step: typeof step }) => Promise<{ deletedBrands: number; failedBrands: number }>;
      const result = await (sampleAuditCleanup as unknown as { fn: Handler }).fn({ step });

      expect(result.failedBrands).toBe(0);
      expect(result.deletedBrands).toBeGreaterThanOrEqual(1);

      const after = await childRowCounts(sampleBrand.id, sampleAuditIds);
      expect(after).toEqual({ brand: 0, audits: 0, citations: 0, failures: 0, actionItems: 0, driftAlerts: 0 });

      // The real org's brand -- same age, same action item, same drift
      // alert -- must be completely untouched: this cleanup job only
      // ever sees audits whose organization_id is the __sample__ org,
      // so a real org's old brand is never even read, let alone deleted.
      const realAfter = await childRowCounts(realBrand.id, realAuditIds);
      expect(realAfter).toEqual({ brand: 1, audits: 2, citations: 1, failures: 1, actionItems: 1, driftAlerts: 1 });
    },
    30_000,
  );
});
