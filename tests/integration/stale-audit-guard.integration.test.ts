/**
 * Audit reliability, Part C, item 2 -- real-DB proof that failIfStale
 * flips a genuinely stuck SAMPLE audit (pending/running well past its
 * own deadline-bound budget -- the platform killed the request mid-
 * flight, an uncaught exception) to failed with reason "Timed out",
 * and leaves everything else (a fresh run still well within budget,
 * an already-terminal audit) completely alone.
 *
 * Reliability follow-up, item 3 -- real-DB proof that
 * failRealAuditIfStale uses a DIFFERENT signal for a real audit
 * (elapsed since its last citations/engine_call_failures row, never
 * elapsed since start alone -- production audit #30 itself took
 * 11m51s, legitimately), and that the "runner finishes after the
 * guard already flipped it" race leaves the audit "failed", never
 * silently overwritten back to "complete".
 *
 * ⚠️ DEV/TEST DB ONLY.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../.env.test.local") });

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { serviceDb } from "@/db/client";
import { auditCostSnapshots } from "@/db/schema/audit-cost-snapshots";
import { audits } from "@/db/schema/audits";
import { brands } from "@/db/schema/brands";
import { citations } from "@/db/schema/citations";
import { engineCallFailures } from "@/db/schema/engine-call-failures";
import { organizations } from "@/db/schema/organizations";
import {
  AUDIT_STALE_PENDING_MS,
  AUDIT_STALE_RUNNING_INACTIVITY_MS,
  failIfStale,
  failRealAuditIfStale,
  recordCostForTerminalAudit,
} from "@/lib/audit/stale-audit-guard";

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
      const brandAudits = await serviceDb.select({ id: audits.id }).from(audits).where(eq(audits.brandId, b.id));
      // engine_call_failures.audit_id has NO ACTION (not cascade) --
      // deleted explicitly first, same dependency order as
      // inngest/functions/sample-audit-cleanup.ts. citations cascades
      // on audit deletion already, but there's no harm being explicit.
      for (const a of brandAudits) {
        await serviceDb.delete(engineCallFailures).where(eq(engineCallFailures.auditId, a.id));
        await serviceDb.delete(citations).where(eq(citations.auditId, a.id));
      }
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

// ---------------------------------------------------------------------
// Reliability follow-up, item 3 -- failRealAuditIfStale checks
// elapsed-since-LAST-ACTIVITY, never elapsed-since-start alone: a real
// audit can legitimately run 11+ minutes (production audit #30 took
// 11m51s), so startedAt age by itself must never be grounds to fail
// one that's still actually producing rows.
// ---------------------------------------------------------------------
describe("failRealAuditIfStale", () => {
  const PENDING_THRESHOLD_MS = 120_000;
  const RUNNING_INACTIVITY_THRESHOLD_MS = 60_000;

  it("a real audit still writing citation rows well past its own start time is NOT flipped", async () => {
    // Started well over the inactivity threshold ago (models "minute
    // 15" of a real, slow-but-alive audit) -- but its most recent
    // citation row is fresh, inside the window.
    const auditId = await seedAudit({
      status: "running",
      ageMs: RUNNING_INACTIVITY_THRESHOLD_MS * 10,
    });
    await serviceDb.insert(citations).values({
      auditId,
      engine: "chatgpt",
      prompt: "still working",
      brandMentioned: false,
      createdAt: new Date(Date.now() - 1_000), // 1s ago -- very fresh
    });

    const wentStale = await failRealAuditIfStale(
      serviceDb,
      auditId,
      PENDING_THRESHOLD_MS,
      RUNNING_INACTIVITY_THRESHOLD_MS,
    );
    expect(wentStale).toBe(false);

    const [row] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
    expect(row.status).toBe("running");
  });

  it("a real audit still writing engine_call_failures rows (no successful citations yet) is also NOT flipped", async () => {
    const auditId = await seedAudit({
      status: "running",
      ageMs: RUNNING_INACTIVITY_THRESHOLD_MS * 10,
    });
    const [{ organizationId }] = await serviceDb
      .select({ organizationId: audits.organizationId })
      .from(audits)
      .where(eq(audits.id, auditId));
    await serviceDb.insert(engineCallFailures).values({
      auditId,
      organizationId,
      engine: "perplexity",
      prompt: "still retrying",
      isBrandedPrompt: false,
      errorClass: "timeout",
      attempts: 1,
      latencyMs: 30_000,
      createdAt: new Date(Date.now() - 1_000),
    });

    const wentStale = await failRealAuditIfStale(
      serviceDb,
      auditId,
      PENDING_THRESHOLD_MS,
      RUNNING_INACTIVITY_THRESHOLD_MS,
    );
    expect(wentStale).toBe(false);

    const [row] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
    expect(row.status).toBe("running");
  });

  it("a real audit with NO activity past the threshold (no rows at all, old startedAt) IS flipped", async () => {
    const auditId = await seedAudit({
      status: "running",
      ageMs: RUNNING_INACTIVITY_THRESHOLD_MS * 10,
    });

    const wentStale = await failRealAuditIfStale(
      serviceDb,
      auditId,
      PENDING_THRESHOLD_MS,
      RUNNING_INACTIVITY_THRESHOLD_MS,
    );
    expect(wentStale).toBe(true);

    const [row] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
    expect(row.status).toBe("failed");
    expect((row.metadata as Record<string, unknown>).error).toBe("Timed out");
  });

  it("a real audit whose LAST row is itself old (stopped producing new ones a while back) IS flipped, even though it has activity rows at all", async () => {
    const auditId = await seedAudit({
      status: "running",
      ageMs: RUNNING_INACTIVITY_THRESHOLD_MS * 10,
    });
    await serviceDb.insert(citations).values({
      auditId,
      engine: "chatgpt",
      prompt: "an old answer from early in the run",
      brandMentioned: false,
      createdAt: new Date(Date.now() - RUNNING_INACTIVITY_THRESHOLD_MS * 5), // long past the window
    });

    const wentStale = await failRealAuditIfStale(
      serviceDb,
      auditId,
      PENDING_THRESHOLD_MS,
      RUNNING_INACTIVITY_THRESHOLD_MS,
    );
    expect(wentStale).toBe(true);
  });

  it("the most recent of several rows is what counts, not the first one found (citation older than a later failure)", async () => {
    const auditId = await seedAudit({
      status: "running",
      ageMs: RUNNING_INACTIVITY_THRESHOLD_MS * 10,
    });
    const [{ organizationId }] = await serviceDb
      .select({ organizationId: audits.organizationId })
      .from(audits)
      .where(eq(audits.id, auditId));
    await serviceDb.insert(citations).values({
      auditId,
      engine: "chatgpt",
      prompt: "an old answer",
      brandMentioned: false,
      createdAt: new Date(Date.now() - RUNNING_INACTIVITY_THRESHOLD_MS * 5),
    });
    // A FAILURE row, written more recently than the citation above --
    // GREATEST must pick this one, not stop at the citation's (older)
    // timestamp the way a naive coalesce-by-table-order would.
    await serviceDb.insert(engineCallFailures).values({
      auditId,
      organizationId,
      engine: "perplexity",
      prompt: "a recent retry",
      isBrandedPrompt: false,
      errorClass: "timeout",
      attempts: 1,
      latencyMs: 30_000,
      createdAt: new Date(Date.now() - 1_000),
    });

    const wentStale = await failRealAuditIfStale(
      serviceDb,
      auditId,
      PENDING_THRESHOLD_MS,
      RUNNING_INACTIVITY_THRESHOLD_MS,
    );
    expect(wentStale).toBe(false);
  });

  it("never touches an already-terminal (complete) audit, no matter how stale its own activity looks", async () => {
    const auditId = await seedAudit({
      status: "complete",
      ageMs: RUNNING_INACTIVITY_THRESHOLD_MS * 10,
    });

    const wentStale = await failRealAuditIfStale(
      serviceDb,
      auditId,
      PENDING_THRESHOLD_MS,
      RUNNING_INACTIVITY_THRESHOLD_MS,
    );
    expect(wentStale).toBe(false);

    const [row] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
    expect(row.status).toBe("complete");
  });

  // "If a run that was flipped to failed later finishes... It must
  // not silently overwrite failed with complete". This proves all
  // three halves of the chosen fix together: the guard flips a
  // genuinely silent audit; the runner's OWN finalize UPDATE -- using
  // the exact same status-guarded WHERE shape added to both
  // lib/audit/run-audit-inline.ts and inngest/functions/run-audit.ts
  // -- is a no-op against the now-"failed" row, never overwriting it;
  // and the runner's own already-terminal branch still records the
  // cost it actually spent (both the audits row and the daily-spend-
  // cap snapshot) via recordCostForTerminalAudit, without resurrecting
  // the audit.
  it("the race: the guard flips a silent audit, the runner's own guarded finalize UPDATE is a no-op, and recordCostForTerminalAudit still records the cost and the spend without overwriting 'failed' with 'complete'", async () => {
    const auditId = await seedAudit({
      status: "running",
      ageMs: RUNNING_INACTIVITY_THRESHOLD_MS * 10,
    });

    const wentStale = await failRealAuditIfStale(
      serviceDb,
      auditId,
      PENDING_THRESHOLD_MS,
      RUNNING_INACTIVITY_THRESHOLD_MS,
    );
    expect(wentStale).toBe(true);

    // The runner's own finalize step, arriving "late" -- same guarded
    // WHERE shape as lib/audit/run-audit-inline.ts and inngest/
    // functions/run-audit.ts's real finalize UPDATEs.
    const [finalized] = await serviceDb
      .update(audits)
      .set({ status: "complete", completedAt: new Date() })
      .where(and(eq(audits.id, auditId), inArray(audits.status, ["pending", "running"])))
      .returning({ id: audits.id });

    expect(finalized).toBeUndefined(); // matched zero rows -- correctly a no-op

    // The runner's own already-terminal branch calls this next -- the
    // money was still actually spent regardless of which status won.
    await recordCostForTerminalAudit(auditId, 0.5);

    const [row] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
    expect(row.status).toBe("failed"); // never overwritten back to "complete"
    expect(row.completedAt).toBeNull();
    expect(Number(row.totalCostUsd)).toBeCloseTo(0.5, 4);

    const [snapshot] = await serviceDb
      .select({ actualCostCents: auditCostSnapshots.actualCostCents })
      .from(auditCostSnapshots)
      .where(eq(auditCostSnapshots.auditId, auditId));
    expect(snapshot).toBeDefined();
    expect(snapshot.actualCostCents).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------
// Stale-run guard follow-up -- literal proof of the two real, exported
// threshold constants (not the fast test-local stand-ins above): a
// pending audit is judged solely against AUDIT_STALE_PENDING_MS (30
// min, since created_at -- it hasn't started, so there's no activity
// to check); a running audit is judged against AUDIT_STALE_RUNNING_
// INACTIVITY_MS (15 min, since its last activity).
// ---------------------------------------------------------------------
describe("the real AUDIT_STALE_PENDING_MS / AUDIT_STALE_RUNNING_INACTIVITY_MS constants", () => {
  it("a pending audit 20 minutes old is NOT flipped (under the 30-minute pending threshold)", async () => {
    const auditId = await seedAudit({ status: "pending", ageMs: 20 * 60 * 1000 });

    const wentStale = await failRealAuditIfStale(
      serviceDb,
      auditId,
      AUDIT_STALE_PENDING_MS,
      AUDIT_STALE_RUNNING_INACTIVITY_MS,
    );
    expect(wentStale).toBe(false);
  });

  it("a pending audit 31 minutes old IS flipped (over the 30-minute pending threshold)", async () => {
    const auditId = await seedAudit({ status: "pending", ageMs: 31 * 60 * 1000 });

    const wentStale = await failRealAuditIfStale(
      serviceDb,
      auditId,
      AUDIT_STALE_PENDING_MS,
      AUDIT_STALE_RUNNING_INACTIVITY_MS,
    );
    expect(wentStale).toBe(true);
  });

  it("a running audit with its last activity 10 minutes ago is NOT flipped (under the 15-minute running threshold)", async () => {
    // Started long ago (models a real, slow-but-alive audit) -- only
    // the most recent activity row's age is what's being proven here.
    const auditId = await seedAudit({ status: "running", ageMs: 2 * 60 * 60 * 1000 });
    await serviceDb.insert(citations).values({
      auditId,
      engine: "chatgpt",
      prompt: "still going",
      brandMentioned: false,
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    });

    const wentStale = await failRealAuditIfStale(
      serviceDb,
      auditId,
      AUDIT_STALE_PENDING_MS,
      AUDIT_STALE_RUNNING_INACTIVITY_MS,
    );
    expect(wentStale).toBe(false);
  });

  it("a running audit with its last activity 16 minutes ago IS flipped (over the 15-minute running threshold)", async () => {
    const auditId = await seedAudit({ status: "running", ageMs: 2 * 60 * 60 * 1000 });
    await serviceDb.insert(citations).values({
      auditId,
      engine: "chatgpt",
      prompt: "an old answer",
      brandMentioned: false,
      createdAt: new Date(Date.now() - 16 * 60 * 1000),
    });

    const wentStale = await failRealAuditIfStale(
      serviceDb,
      auditId,
      AUDIT_STALE_PENDING_MS,
      AUDIT_STALE_RUNNING_INACTIVITY_MS,
    );
    expect(wentStale).toBe(true);
  });
});
