/**
 * Vunnara Build 1, Part G.7 -- real-DB proof that the audit detail
 * page shows "Method: memory-only (v1)" for an audit that predates
 * (or ran under) the old memory-only methodology, and "Method: web-
 * grounded (v2)" for one that ran under this build's web-search
 * methodology -- read from the audit's own stored methodology_version,
 * never inferred from the current build's default.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const MEMORY_ONLY_AUDIT_ID = randomUUID();
const WEB_GROUNDED_AUDIT_ID = randomUUID();

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
    VALUES (${ORG_ID}, ${`methlabel-${ORG_ID}`}, 'Methodology Label Test Org', ${`methlabel-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Methodology Label Co', 'methlabel.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, methodology_version, completed_at)
    VALUES (${MEMORY_ONLY_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'complete', ${["chatgpt"]}, 1, 1, 1, now())
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, methodology_version, completed_at)
    VALUES (${WEB_GROUNDED_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 2, 'complete', ${["chatgpt"]}, 1, 1, 2, now())
  `;
});

afterAll(async () => {
  await client`DELETE FROM audits WHERE id IN (${MEMORY_ONLY_AUDIT_ID}, ${WEB_GROUNDED_AUDIT_ID})`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function renderAuditPage(auditId: string): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  const element = await AuditPage({
    params: Promise.resolve({ auditId }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(element);
}

describe("audit detail page — honest methodology label", () => {
  it('shows "Method: memory-only (v1)" for an audit stored with methodology_version = 1', async () => {
    const html = await renderAuditPage(MEMORY_ONLY_AUDIT_ID);
    expect(html).toContain("Method: memory-only (v1)");
    expect(html).not.toContain("Method: web-grounded (v2)");
  });

  it('shows "Method: web-grounded (v2)" for an audit stored with methodology_version = 2', async () => {
    const html = await renderAuditPage(WEB_GROUNDED_AUDIT_ID);
    expect(html).toContain("Method: web-grounded (v2)");
    expect(html).not.toContain("Method: memory-only (v1)");
  });
});
