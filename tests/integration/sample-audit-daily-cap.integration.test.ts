/**
 * Vunnara (sample-audit follow-up, 20 Oct), item 5 -- real-DB proof
 * that POST /api/sample-audit checks the global daily spend cap
 * (lib/sample-audit/daily-cap.ts) BEFORE doing anything else: a
 * tripped cap returns a friendly "busy" message and makes no engine
 * calls, no brand row, no audit row -- never a fake/fabricated
 * result, never silence. ⚠️ DEV/TEST DB ONLY.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/sample-audit/rate-limit", () => ({
  checkSampleAuditRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 2 }),
}));

const { mockCheckDailyCap } = vi.hoisted(() => ({ mockCheckDailyCap: vi.fn() }));
vi.mock("@/lib/sample-audit/daily-cap", () => ({
  checkSampleAuditDailyCap: mockCheckDailyCap,
}));

let client: ReturnType<typeof postgres>;
const DOMAIN = `sample-cap-${randomUUID()}.example.com.au`;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
});

afterAll(async () => {
  const [brand] = await client`SELECT id FROM brands WHERE domain = ${DOMAIN}`;
  if (brand) {
    await client`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE brand_id = ${brand.id})`;
    await client`DELETE FROM audits WHERE brand_id = ${brand.id}`;
    await client`DELETE FROM brands WHERE id = ${brand.id}`;
  }
  await client.end();
});

async function postSampleAudit() {
  const { POST } = await import("@/app/api/sample-audit/route");
  const req = new Request("http://localhost/api/sample-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Audit reliability, Part C, item 4: location is now required.
    body: JSON.stringify({ domain: DOMAIN, vertical: "tradies", location: "NSW:Bondi" }),
  });
  return POST(req);
}

describe("POST /api/sample-audit -- global daily spend cap", () => {
  it("a tripped cap returns 503 with a friendly 'busy' message, and creates no brand or audit row", async () => {
    mockCheckDailyCap.mockResolvedValue({ allowed: false, spentTodayCents: 2500, capCents: 2000 });

    const res = await postSampleAudit();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/busy/i);
    expect(body.error).not.toMatch(/\d/); // never leaks the real $ figures to the public caller

    const rows = await client`SELECT id FROM brands WHERE domain = ${DOMAIN}`;
    expect(rows.length).toBe(0);
  });

  it("an un-tripped cap lets the request through to the real flow (a brand + audit row get created)", async () => {
    mockCheckDailyCap.mockResolvedValue({ allowed: true, spentTodayCents: 50, capCents: 2000 });

    const res = await postSampleAudit();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.auditId).toBeDefined();
    expect(body.brandId).toBeDefined();
    // `completion` (the background-execution promise) must never be
    // serialised into the public JSON response.
    expect(body.completion).toBeUndefined();

    const rows = await client`SELECT id FROM brands WHERE domain = ${DOMAIN}`;
    expect(rows.length).toBe(1);
  });
});
