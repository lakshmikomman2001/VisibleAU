/**
 * Task #46 (14th follow-up) -- RED->GREEN for a real HIGH finding: this
 * route used to gate on `currentUser.role === "owner"`, an ordinary
 * per-org role every org's own first user gets by default, not a
 * platform-wide privilege. Any customer who owns their own org could call
 * it and get back, in the response body, the names of unclassified
 * brands belonging to every OTHER organization too -- serviceDb's query
 * has no org filter at all (the whole point is a platform-wide sweep),
 * so the ONLY thing that made this safe was the gate in front of it, and
 * that gate checked the wrong thing. Fixed by switching to
 * isPlatformAdmin(). Proven here against real Postgres: seed brands in
 * two different real orgs, confirm a non-platform-admin never sees
 * either org's data (not just "the other org's" -- NO org's, since this
 * route has no legitimate per-org caller at all), and a platform admin
 * does.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
});

vi.mock("@/lib/auth/platform-admin", () => ({
  checkPlatformAdmin: vi.fn(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

import { POST } from "@/app/api/admin/backfill-classify/route";
import { checkPlatformAdmin } from "@/lib/auth/platform-admin";

const mockCheckPlatformAdmin = vi.mocked(checkPlatformAdmin);

const ORG_A_ID = randomUUID();
const ORG_B_ID = randomUUID();
const BRAND_A_NAME = `RED-GREEN-A-${randomUUID()}`;
const BRAND_B_NAME = `RED-GREEN-B-${randomUUID()}`;

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  client = postgres(getTestDatabaseUrl(), { max: 1 });

  for (const [id, name] of [
    [ORG_A_ID, "RED-GREEN Org A"],
    [ORG_B_ID, "RED-GREEN Org B"],
  ] as const) {
    await client`
      INSERT INTO organizations (id, clerk_org_id, name, tier, region)
      VALUES (${id}, ${"redgreen-" + id}, ${name}, 'free', 'au')
      ON CONFLICT (id) DO NOTHING
    `;
  }

  await client`
    INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions, classification)
    VALUES
      (${ORG_A_ID}, ${BRAND_A_NAME}, ${"redgreen-a-" + randomUUID() + ".example.com"}, 'tradies', 'au', ARRAY['NSW:Sydney'], NULL),
      (${ORG_B_ID}, ${BRAND_B_NAME}, ${"redgreen-b-" + randomUUID() + ".example.com"}, 'tradies', 'au', ARRAY['NSW:Sydney'], NULL)
  `;
});

afterAll(async () => {
  await client`DELETE FROM brands WHERE organization_id IN (${ORG_A_ID}, ${ORG_B_ID})`;
  await client`DELETE FROM organizations WHERE id IN (${ORG_A_ID}, ${ORG_B_ID})`;
  await client.end();
});

describe("POST /api/admin/backfill-classify -- platform-admin only, not per-org owner", () => {
  it("an ordinary (non-platform-admin) caller gets 404 with no brand data from ANY org", async () => {
    mockCheckPlatformAdmin.mockResolvedValue({ allowed: false, userId: "ordinary-org-owner" });

    const res = await POST();
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(BRAND_A_NAME);
    expect(JSON.stringify(body)).not.toContain(BRAND_B_NAME);
  });

  it("a platform admin gets 200 with the cross-org sweep data (intended -- that's the feature)", async () => {
    mockCheckPlatformAdmin.mockResolvedValue({ allowed: true, userId: "sri" });

    const res = await POST();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.brands).toContain(BRAND_A_NAME);
    expect(body.brands).toContain(BRAND_B_NAME);
  });
});
