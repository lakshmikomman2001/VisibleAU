/**
 * Vunnara Build 1 follow-up (entry-point check) -- real-DB proof that
 * the CI export formats (sarif/junit/gha) distinguish "this audit never
 * ran because the brand needs confirmation" from "this audit ran and
 * genuinely found zero mentions" (audit-export-insufficient-data.
 * integration.test.ts's zero-mention case). Both would otherwise fall
 * through to resolveAuditDimensions() and read identically as
 * insufficient_data -- a CI pipeline polling this audit's gate would
 * see a clean pass/skip either way, which is correct, but a human
 * reading the SARIF/JUnit/GHA output needs to see WHY, so they fix the
 * actual blocker (confirm the brand) instead of the (same-looking,
 * wrong) assumption that the audit ran and found nothing.
 *
 * Never a failed gate either way -- SARIF "note" (not "error"), JUnit
 * <skipped> (not a <failure>), GHA ::notice:: (not an exit-nonzero
 * ::error::) -- exactly the "CI exports emit a neutral/skipped result,
 * never a failed gate" requirement.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`ciexp-${ORG_ID}`}, 'CI Export Confirm Test Org', ${`ciexp-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'CI Export Co', 'ciexportco.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  // The exact shape run-audit.ts / run-audit-inline.ts's shared catch
  // block leaves behind when getAuditPrompts() throws
  // BrandNeedsConfirmationError -- failed, with a stable errorCode, no
  // citation rows at all (the gate fires before any LLM call).
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'manual', 'failed', ${client.json({ error: "Brand needs confirmation", errorCode: "BrandNeedsConfirmationError" })})
  `;
});

afterAll(async () => {
  await client`DELETE FROM audit_exports WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function callExport(format: string) {
  const { GET } = await import("@/app/api/audits/[auditId]/export/route");
  const req = new Request(`http://localhost/api/audits/${AUDIT_ID}/export?format=${format}`);
  return GET(req, { params: Promise.resolve({ auditId: AUDIT_ID }) });
}

describe("export route -- a needs-confirmation audit never reads as insufficient_data in CI exports", () => {
  it("SARIF: one 'note'-level result, never 'error', with an executionSuccessful invocation", async () => {
    const res = await callExport("sarif");
    expect(res.status).toBe(200);
    const sarif = await res.json();
    const results = sarif.runs[0].results;
    expect(results).toHaveLength(1);
    expect(results[0].level).toBe("note");
    expect(results[0].message.text).toMatch(/hasn't confirmed its business type and location/i);
    expect(sarif.runs[0].invocations[0].executionSuccessful).toBe(true);
  });

  it("JUnit: one <skipped> testcase, zero <failure>s", async () => {
    const res = await callExport("junit");
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('failures="0" skipped="1"');
    expect(xml).toContain("<skipped");
    expect(xml).not.toContain("<failure");
  });

  it("GHA: a ::notice:: line, never ::error::", async () => {
    const res = await callExport("gha");
    expect(res.status).toBe(200);
    const txt = await res.text();
    expect(txt).toMatch(/^::notice /);
    expect(txt).not.toContain("::error");
  });
});
