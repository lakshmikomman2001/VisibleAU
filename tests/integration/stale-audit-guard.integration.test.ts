/**
 * Audit reliability, Part C, item 2 -- real-DB proof that failIfStale
 * flips a genuinely stuck audit (pending/running well past its own
 * budget -- the platform killed the request mid-flight, an uncaught
 * exception) to failed with reason "Timed out", and leaves everything
 * else (a fresh run still well within budget, an already-terminal
 * audit) completely alone. ⚠️ DEV/TEST DB ONLY.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../.env.test.local") });

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { serviceDb } from "@/db/client";
import { audits } from "@/db/schema/audits";
import { brands } from "@/db/schema/brands";
import { organizations } from "@/db/schema/organizations";
import { failIfStale } from "@/lib/audit/stale-audit-guard";

const TEST_PREFIX = `stale-guard-${Date.now()}`;
const STALE_THRESHOLD_MS = 50_000;

const createdOrgIds: string[] = [];

async function seedAudit(opts: { status: "pending" | "running" | "complete"; ageMs: number }) {
  const [org] = await serviceDb
    .insert(organizations)
    .values({ clerkOrgId: `${TEST_PREFIX}-${randomUUID()}`, name: "[stale guard test]" })
    .returning();
  createdOrgIds.push(org.id);

  const [brand] = await serviceDb
    .insert(brands)
    .values({
      organizationId: org.id,
      name: "Stale Guard Test Brand",
      domain: `${TEST_PREFIX}-${randomUUID()}.example.com.au`,
      vertical: "tradies",
      region: "au",
      competitors: [],
      primaryRegions: [],
    })
    .returning();

  const startedAt = new Date(Date.now() - opts.ageMs);
  const [audit] = await serviceDb
    .insert(audits)
    .values({
      brandId: brand.id,
      organizationId: org.id,
      auditNumber: 1,
      triggeredBy: "manual",
      status: opts.status,
      startedAt,
      createdAt: startedAt,
    })
    .returning();

  return audit.id;
}

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    const orgBrands = await serviceDb.select({ id: brands.id }).from(brands).where(eq(brands.organizationId, orgId));
    for (const b of orgBrands) {
      await serviceDb.delete(audits).where(eq(audits.brandId, b.id));
    }
    await serviceDb.delete(brands).where(eq(brands.organizationId, orgId));
    await serviceDb.delete(organizations).where(eq(organizations.id, orgId));
  }
});

describe("failIfStale", () => {
  it("flips a running audit well past its threshold to failed, with reason 'Timed out'", async () => {
    const auditId = await seedAudit({ status: "running", ageMs: STALE_THRESHOLD_MS + 10_000 });

    const wentStale = await failIfStale(serviceDb, auditId, STALE_THRESHOLD_MS);
    expect(wentStale).toBe(true);

    const [row] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
    expect(row.status).toBe("failed");
    expect(row.failedAt).not.toBeNull();
    expect((row.metadata as Record<string, unknown>).error).toBe("Timed out");
  });

  it("flips a pending audit the same way", async () => {
    const auditId = await seedAudit({ status: "pending", ageMs: STALE_THRESHOLD_MS + 10_000 });

    const wentStale = await failIfStale(serviceDb, auditId, STALE_THRESHOLD_MS);
    expect(wentStale).toBe(true);

    const [row] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
    expect(row.status).toBe("failed");
  });

  it("leaves a running audit still well within budget untouched", async () => {
    const auditId = await seedAudit({ status: "running", ageMs: 1_000 });

    const wentStale = await failIfStale(serviceDb, auditId, STALE_THRESHOLD_MS);
    expect(wentStale).toBe(false);

    const [row] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
    expect(row.status).toBe("running");
  });

  it("never touches an already-terminal (complete) audit, no matter how old", async () => {
    const auditId = await seedAudit({ status: "complete", ageMs: STALE_THRESHOLD_MS + 60_000 });

    const wentStale = await failIfStale(serviceDb, auditId, STALE_THRESHOLD_MS);
    expect(wentStale).toBe(false);

    const [row] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
    expect(row.status).toBe("complete");
  });

  it("a second overlapping call is a safe no-op -- never a double-flip", async () => {
    const auditId = await seedAudit({ status: "running", ageMs: STALE_THRESHOLD_MS + 10_000 });

    const [first, second] = await Promise.all([
      failIfStale(serviceDb, auditId, STALE_THRESHOLD_MS),
      failIfStale(serviceDb, auditId, STALE_THRESHOLD_MS),
    ]);
    // Exactly one of the two concurrent UPDATEs matches the row (its
    // own WHERE repeats the staleness condition, including status IN
    // (pending, running) -- the loser's UPDATE matches zero rows once
    // the winner has already flipped it).
    expect([first, second].filter(Boolean)).toHaveLength(1);

    const [row] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
    expect(row.status).toBe("failed");
  });
});
