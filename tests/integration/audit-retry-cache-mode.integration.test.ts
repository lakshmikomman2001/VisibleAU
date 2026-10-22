/**
 * "'Run audit' always fetches fresh answers" (23 Oct), item 1 --
 * resolveCacheMode() is the ONE place both real-audit runners decide
 * a whole audit's cache mode. There's no dedicated "retry" entry
 * point anywhere in the app (confirmed: the "Retry audit" button just
 * starts a brand-new manual audit with no reference to the one it's
 * retrying) -- so "is this a retry" is answered by looking at the
 * brand's own recent audit history, not an explicit flag.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();

let client: ReturnType<typeof postgres>;
let nextAuditNumber = 1;

async function seedAudit(opts: {
  status: "pending" | "running" | "complete" | "failed";
  triggeredBy?: string;
  promptPackVersion?: number | null;
  failedAt?: Date | null;
}) {
  const id = randomUUID();
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, prompt_pack_version, failed_at)
    VALUES (
      ${id}, ${BRAND_ID}, ${ORG_ID}, ${nextAuditNumber++},
      ${opts.triggeredBy ?? "manual"}, ${opts.status}, ${opts.promptPackVersion ?? 1}, ${opts.failedAt ?? null}
    )
  `;
  return id;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`cache-mode-${ORG_ID}`}, 'Cache Mode Test Org', ${`cache-mode-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Cache Mode Co', 'cachemode.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
});

afterAll(async () => {
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
});

describe("resolveCacheMode", () => {
  it('a brand new audit for a brand with no prior failure is "fresh"', async () => {
    const { resolveCacheMode } = await import("@/lib/audit/cache-mode");
    const id = await seedAudit({ status: "pending" });

    const mode = await resolveCacheMode({
      id,
      brandId: BRAND_ID,
      promptPackVersion: 1,
      triggeredBy: "manual",
    });
    expect(mode).toBe("fresh");
  });

  it('triggeredBy "sample" is always "sample", regardless of any prior failure', async () => {
    const { resolveCacheMode } = await import("@/lib/audit/cache-mode");
    await seedAudit({ status: "failed", promptPackVersion: 1, failedAt: new Date() });
    const id = await seedAudit({ status: "pending", triggeredBy: "sample" });

    const mode = await resolveCacheMode({
      id,
      brandId: BRAND_ID,
      promptPackVersion: 1,
      triggeredBy: "sample",
    });
    expect(mode).toBe("sample");
  });

  it('a retry within AUDIT_RETRY_CACHE_WINDOW_MS (1h) of the same brand+pack-version failing is "retry"', async () => {
    const { resolveCacheMode } = await import("@/lib/audit/cache-mode");
    await seedAudit({
      status: "failed",
      promptPackVersion: 7,
      failedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
    });
    const id = await seedAudit({ status: "pending", promptPackVersion: 7 });

    const mode = await resolveCacheMode({
      id,
      brandId: BRAND_ID,
      promptPackVersion: 7,
      triggeredBy: "manual",
    });
    expect(mode).toBe("retry");
  });

  it('a "retry" after AUDIT_RETRY_CACHE_WINDOW_MS has passed is "fresh" -- the window really is 1h, not open-ended', async () => {
    const { resolveCacheMode } = await import("@/lib/audit/cache-mode");
    await seedAudit({
      status: "failed",
      promptPackVersion: 8,
      failedAt: new Date(Date.now() - 90 * 60 * 1000), // 90 min ago -- past the window
    });
    const id = await seedAudit({ status: "pending", promptPackVersion: 8 });

    const mode = await resolveCacheMode({
      id,
      brandId: BRAND_ID,
      promptPackVersion: 8,
      triggeredBy: "manual",
    });
    expect(mode).toBe("fresh");
  });

  it('a recent failure at a DIFFERENT prompt-pack version is "fresh" -- never cross-version reuse', async () => {
    const { resolveCacheMode } = await import("@/lib/audit/cache-mode");
    await seedAudit({
      status: "failed",
      promptPackVersion: 9,
      failedAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    const id = await seedAudit({ status: "pending", promptPackVersion: 10 });

    const mode = await resolveCacheMode({
      id,
      brandId: BRAND_ID,
      promptPackVersion: 10,
      triggeredBy: "manual",
    });
    expect(mode).toBe("fresh");
  });

  it('a recent failure of a DIFFERENT brand never counts -- "fresh"', async () => {
    const { resolveCacheMode } = await import("@/lib/audit/cache-mode");
    const otherBrandId = randomUUID();
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
      VALUES (${otherBrandId}, ${ORG_ID}, 'Other Brand', 'otherbrand.example.com.au', 'tradies', 'au', ARRAY[]::text[])
    `;
    const failedOtherId = randomUUID();
    await client`
      INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, prompt_pack_version, failed_at)
      VALUES (${failedOtherId}, ${otherBrandId}, ${ORG_ID}, ${nextAuditNumber++}, 'manual', 'failed', 11, ${new Date()})
    `;
    const id = await seedAudit({ status: "pending", promptPackVersion: 11 });

    const mode = await resolveCacheMode({
      id,
      brandId: BRAND_ID,
      promptPackVersion: 11,
      triggeredBy: "manual",
    });
    expect(mode).toBe("fresh");

    await client`DELETE FROM audits WHERE id = ${failedOtherId}`;
    await client`DELETE FROM brands WHERE id = ${otherBrandId}`;
  });

  it("a NULL prompt-pack version never matches anything (SQL NULL = NULL is never true) -- always fresh", async () => {
    const { resolveCacheMode } = await import("@/lib/audit/cache-mode");
    await seedAudit({ status: "failed", promptPackVersion: null, failedAt: new Date() });
    const id = await seedAudit({ status: "pending", promptPackVersion: null });

    const mode = await resolveCacheMode({
      id,
      brandId: BRAND_ID,
      promptPackVersion: null,
      triggeredBy: "manual",
    });
    expect(mode).toBe("fresh");
  });

  it("never matches itself as its own 'prior failure'", async () => {
    const { resolveCacheMode } = await import("@/lib/audit/cache-mode");
    const id = await seedAudit({
      status: "failed",
      promptPackVersion: 12,
      failedAt: new Date(),
    });

    // Re-resolving for the SAME row (e.g. if it were ever re-queried)
    // must never treat its own failure as evidence of a prior one.
    const mode = await resolveCacheMode({
      id,
      brandId: BRAND_ID,
      promptPackVersion: 12,
      triggeredBy: "manual",
    });
    expect(mode).toBe("fresh");
  });

  it("triggeredBy other than 'sample' (schedule, bulk_reaudit, workflow_run, reaudit) still gets retry treatment from a recent same-brand+version failure", async () => {
    const { resolveCacheMode } = await import("@/lib/audit/cache-mode");
    await seedAudit({
      status: "failed",
      promptPackVersion: 13,
      failedAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    const id = await seedAudit({ status: "pending", promptPackVersion: 13, triggeredBy: "schedule" });

    const mode = await resolveCacheMode({
      id,
      brandId: BRAND_ID,
      promptPackVersion: 13,
      triggeredBy: "schedule",
    });
    expect(mode).toBe("retry");
  });
});
