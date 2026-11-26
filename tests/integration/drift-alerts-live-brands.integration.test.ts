/**
 * Leftovers task, part 6 (17 Nov; Sri's production check of 16 Nov): the agency dashboard's "Pending drift alerts"
 * counted a deleted brand's alerts (production: 3 for the deleted Galah Plumbing), and GET /api/drift-alerts listed
 * them. Both now count live brands only, as the drift alerts page already did (lib/drift/pending-alerts.ts).
 *
 * Real DB: one live brand and one deleted brand, each with an unacknowledged alert.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session } = vi.hoisted(() => ({ session: { organizationId: "" } }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-00000000d71f",
    organizationId: session.organizationId,
    role: "owner",
    organization: { id: session.organizationId, name: "Drift Org", region: "au", metadata: {} },
  })),
}));

const ORG = randomUUID();
const LIVE = randomUUID();
const DELETED = randomUUID();
let client: ReturnType<typeof postgres>;

async function brandWithAlert(brandId: string, name: string, deleted: boolean) {
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, deleted_at)
    VALUES (${brandId}, ${ORG}, ${name}, ${`${brandId.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
      ${deleted ? new Date() : null})
  `;
  const [a, b] = [randomUUID(), randomUUID()];
  for (const id of [a, b]) {
    await client`
      INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, completed_at)
      VALUES (${id}, ${brandId}, ${ORG}, (SELECT coalesce(max(audit_number), 0) + 1 FROM audits WHERE organization_id = ${ORG}),
        'manual', 'complete', now())
    `;
  }
  await client`
    INSERT INTO drift_alerts (organization_id, brand_id, current_audit_id, previous_audit_id, severity)
    VALUES (${ORG}, ${brandId}, ${b}, ${a}, 'warning')
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  session.organizationId = ORG;
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`drift-live-${ORG}`}, 'Drift Live Brands Test Org', ${`drift-live-${ORG}`})
  `;
  await brandWithAlert(LIVE, "Wren Home Services", false);
  await brandWithAlert(DELETED, "Galah Plumbing", true);
}, 60_000);

afterAll(async () => {
  await deleteOrgRows(client, ORG);
  await client.end();
});

describe("drift alerts are counted and listed for live brands only", () => {
  it("countPendingDriftAlerts: the live brand's alert, not the deleted brand's", async () => {
    const { withRlsContext } = await import("@/db/client");
    const { countPendingDriftAlerts } = await import("@/lib/drift/pending-alerts");
    const n = await withRlsContext(ORG, (tx) => countPendingDriftAlerts(tx, ORG));
    expect(n).toBe(1);
  });

  it("GET /api/drift-alerts lists the live brand's alert only", async () => {
    const { GET } = await import("@/app/api/drift-alerts/route");
    const res = await GET(new Request("http://localhost/api/drift-alerts?acknowledged=false"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alerts: { brandId: string; brandName: string }[] };
    expect(body.alerts.map((a) => a.brandName)).toEqual(["Wren Home Services"]);
  });

  it("the agency dashboard's Pending drift alerts uses the same count", () => {
    const page = readFileSync("app/(auth)/agency/page.tsx", "utf8");
    expect(page).toContain("countPendingDriftAlerts(tx, orgId)");
    expect(page).not.toMatch(/\.from\(driftAlerts\)/);
  });
});
