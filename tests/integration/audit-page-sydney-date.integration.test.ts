/**
 * "Dates show in Sydney time" (23 Oct), item 3 -- the audit header's
 * own date must use the business's timezone (formatInOrgTimezone,
 * lib/platform/org-timezone.ts), not the server's own ambient one.
 * The task's own literal case: an audit completed at 21:09 UTC on 22
 * Oct is already 23 Oct in Sydney (AEDT, UTC+11, in effect since
 * 2026-10-04).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
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
    VALUES (${ORG_ID}, ${`sydney-date-${ORG_ID}`}, 'Sydney Date Test Org', ${`sydney-date-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Sydney Date Co', 'sydneydate.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;
  // 21:09 UTC on 22 Oct 2026 -- 08:09 on 23 Oct in Sydney (AEDT, +11h).
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, methodology_version)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'complete', ${["chatgpt"]}, 1, 1, '2026-10-22T21:09:00.000Z', 1)
  `;
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet, llm_model, is_cache_hit, llm_cost_usd)
    VALUES (${AUDIT_ID}, 'chatgpt', 'Best plumber in Sydney?', 1, false, false, ${client.json([])}, 'A fresh answer.', 'gpt-sydney-date-test', false, '0.002')
  `;
});

afterAll(async () => {
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("Audit page header date -- renders in Sydney time, not UTC (item 3)", () => {
  it("an audit completed at 21:09 UTC on 22 Oct shows '23 Oct 2026', never '22 Oct 2026'", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const element = await AuditPage({
      params: Promise.resolve({ auditId: AUDIT_ID }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("23 Oct 2026");
    expect(html).not.toContain("22 Oct 2026");
  });
});
