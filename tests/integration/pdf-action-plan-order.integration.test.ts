/**
 * 14 Nov (Sri approved) -- the PDF's Action Plan lists an audit's open action items in one order: priority
 * (high, medium, low), then the date each was made (oldest first), then title -- the audit page's order
 * (lib/recommendations/action-order.ts). The export route (app/api/audits/[auditId]/export/route.ts) read them
 * with no ORDER BY, so the PDF got whatever order Postgres returned: the off-parity snapshot saw the same audit's
 * items in two orders. Here the rows are stored in an order the rule disagrees with, so the old route returns it
 * wrong every time.
 *
 * DEV/TEST DB ONLY (visibleau_integration) -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { mockRenderAuditPdf } = vi.hoisted(() => ({ mockRenderAuditPdf: vi.fn() }));
vi.mock("@/lib/pdf/render", () => ({ renderAuditPdf: mockRenderAuditPdf }));

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

let client: ReturnType<typeof postgres>;

/** In storage order; the rule's order is: Older high, Alpha, Beta, Mid, Zebra, Dismissed (not open: never). */
const ITEMS = [
  {
    key: "itest-zebra",
    title: "Zebra advice",
    impact: "low",
    at: "2026-11-13T10:00:00Z",
    status: "open",
  },
  {
    key: "itest-beta",
    title: "Beta advice",
    impact: "high",
    at: "2026-11-13T10:05:00Z",
    status: "open",
  },
  {
    key: "itest-alpha",
    title: "Alpha advice",
    impact: "high",
    at: "2026-11-13T10:05:00Z",
    status: "open",
  },
  {
    key: "itest-mid",
    title: "Mid advice",
    impact: "medium",
    at: "2026-11-13T09:00:00Z",
    status: "open",
  },
  {
    key: "itest-older",
    title: "Older high",
    impact: "high",
    at: "2026-11-13T09:00:00Z",
    status: "open",
  },
  {
    key: "itest-gone",
    title: "Dismissed",
    impact: "high",
    at: "2026-11-13T08:00:00Z",
    status: "dismissed",
  },
];

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`pao-${ORG_ID}`}, 'PDF Order Org', ${`pao-${ORG_ID}`})`;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'PDF Order Plumbing', 'pdforder.example.com.au', 'tradies', 'au', ARRAY['NSW:Bondi'], ARRAY[]::text[])`;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'complete', ${["chatgpt"]}, 1, 1, now())`;
  for (const i of ITEMS) {
    await client`
      INSERT INTO action_items (organization_id, brand_id, audit_id, recommendation_key, dimension, title, action,
        confidence_label, confidence_basis, expected_impact_score, status, created_at)
      VALUES (${ORG_ID}, ${BRAND_ID}, ${AUDIT_ID}, ${i.key}, 'visibility', ${i.title}, ${`Do ${i.title}.`},
        'likely', 'verified', ${i.impact}, ${i.status}, ${i.at})`;
  }
}, 60_000);

afterAll(async () => {
  await client`DELETE FROM audit_exports WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM action_items WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("the PDF's Action Plan order", () => {
  it("priority, then oldest first, then title -- whatever order the rows are stored in", async () => {
    mockRenderAuditPdf.mockResolvedValue(Buffer.from("%PDF-1.4 stub"));
    const { GET } = await import("@/app/api/audits/[auditId]/export/route");
    const res = await GET(
      new Request(`http://localhost/api/audits/${AUDIT_ID}/export?format=pdf`),
      {
        params: Promise.resolve({ auditId: AUDIT_ID }),
      },
    );
    expect(res.status).toBe(200);
    const data = mockRenderAuditPdf.mock.calls[0]?.[0] as { actionItems: Array<{ title: string }> };
    expect(data.actionItems.map((a) => a.title)).toEqual([
      "Older high",
      "Alpha advice",
      "Beta advice",
      "Mid advice",
      "Zebra advice",
    ]);
  }, 120_000);
});
