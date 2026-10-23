/**
 * "The Action Center shows each brand's latest audit only" (23 Oct),
 * item 1 -- real-DB, real-page proof that app/(auth)/action-center/
 * page.tsx itself lists only a brand's latest complete audit's open
 * items, plus in_progress/done items from ANY audit, even when the
 * generation-time dismissal (lib/recommendations/persist.ts) never
 * ran. The open item on the OLDER audit here is deliberately left
 * status = 'open' -- never dismissed -- so this test exercises the
 * page's own read-side filter as the belt-and-suspenders control it's
 * meant to be (see the page's own comment above latestAuditIds),
 * independent of whether the write-time dismissal step ever ran.
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
const AUDIT_OLD = randomUUID();
const AUDIT_NEW = randomUUID();

const TITLE_OPEN_OLD = "Old open item -- must not show";
const TITLE_OPEN_NEW = "New open item -- must show";
const TITLE_INPROGRESS_OLD = "In progress from old audit -- must show";
const TITLE_DONE_OLD = "Done from old audit -- must show";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn(),
}));

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`ac-latest-${ORG_ID}`}, 'Action Center Latest Audit Test Org', ${`ac-latest-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'AC Latest Audit Brand', 'ac-latest.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at)
    VALUES
      (${AUDIT_OLD}, ${BRAND_ID}, ${ORG_ID}, 1, 'complete', ${["chatgpt"]}, 1, 1, '2026-10-01T00:00:00Z'),
      (${AUDIT_NEW}, ${BRAND_ID}, ${ORG_ID}, 2, 'complete', ${["chatgpt"]}, 1, 1, '2026-10-10T00:00:00Z')
  `;
  await client`
    INSERT INTO action_items (organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, status)
    VALUES
      (${ORG_ID}, ${BRAND_ID}, ${AUDIT_OLD}, 'directory-visibility', 'frequency', ${TITLE_OPEN_OLD}, 'Do it.', 'likely', 'high', 'open'),
      (${ORG_ID}, ${BRAND_ID}, ${AUDIT_NEW}, 'wikipedia-article', 'frequency', ${TITLE_OPEN_NEW}, 'Do it.', 'likely', 'high', 'open'),
      (${ORG_ID}, ${BRAND_ID}, ${AUDIT_OLD}, 'entity-profiles', 'frequency', ${TITLE_INPROGRESS_OLD}, 'Do it.', 'likely', 'medium', 'in_progress'),
      (${ORG_ID}, ${BRAND_ID}, ${AUDIT_OLD}, 'stale-content', 'accuracy', ${TITLE_DONE_OLD}, 'Did it.', 'likely', 'low', 'done')
  `;
});

afterAll(async () => {
  await client`DELETE FROM action_items WHERE brand_id = ${BRAND_ID}`;
  await client`DELETE FROM audits WHERE brand_id = ${BRAND_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function renderActionCenter(): Promise<string> {
  const ActionCenterPage = (await import("@/app/(auth)/action-center/page")).default;
  const element = await ActionCenterPage({ searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(element);
}

describe("Action Center page -- latest audit scope (item 1)", () => {
  it("shows the latest audit's open item, hides an older open item never dismissed, and always shows in_progress/done from any audit", async () => {
    const html = await renderActionCenter();

    expect(html).toContain(TITLE_OPEN_NEW);
    expect(html).toContain(TITLE_INPROGRESS_OLD);
    expect(html).toContain(TITLE_DONE_OLD);
    expect(html).not.toContain(TITLE_OPEN_OLD);
  });
});
