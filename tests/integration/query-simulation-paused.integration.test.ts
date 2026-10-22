/**
 * "Pause query simulation, cap competitor comparisons..." item 1 --
 * simulate-query-fan-out.ts picks 5 prompts from ANY vertical (no
 * .where() on its verticalPackPrompts query), so its results are
 * paused (QUERY_SIMULATION_ENABLED, default false) until
 * docs/backlog/query-simulation-fix.md's real fix ships. While paused,
 * the fan-out route must never surface existing query_fan_out_results
 * rows -- they were built from the wrong vertical's prompts -- even
 * though nothing deletes them.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();

let client: ReturnType<typeof postgres>;
let getFanOut: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;

function makeReq(path: string): Request {
  return new Request(`http://localhost:3000${path}`);
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  const [{ GET }, { getCurrentUser }] = await Promise.all([
    import("@/app/api/brands/[brandId]/fan-out/route"),
    import("@/lib/auth/current-user"),
  ]);
  getFanOut = GET;
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: randomUUID(),
    organizationId: ORG_ID,
  } as Awaited<ReturnType<typeof getCurrentUser>>);

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`query-sim-paused-${ORG_ID}`}, 'Query Sim Paused Test Org', ${`query-sim-paused-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Query Sim Paused Co', 'querysimpaused.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, completed_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'manual', 'complete', now())
  `;
  // A real row that WOULD be returned if the route didn't pause --
  // standing in for "built from the wrong vertical's prompts".
  await client`
    INSERT INTO query_fan_out_results
      (audit_id, brand_id, organization_id, original_prompt, engine, sub_query, sub_query_rank, brand_appeared)
    VALUES
      (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 'best plumber in Bondi', 'chatgpt', 'emergency plumber Bondi', 1, false)
  `;
});

afterAll(async () => {
  await client`DELETE FROM query_fan_out_results WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
});

describe("fan-out route while QUERY_SIMULATION_ENABLED is false (the real default)", () => {
  beforeEach(() => {
    vi.stubEnv("QUERY_SIMULATION_ENABLED", "false");
  });

  it("returns { groups: [], paused: true } -- never the existing, wrong-vertical rows", async () => {
    const res = await getFanOut(
      makeReq(`/api/brands/${BRAND_ID}/fan-out`),
      { params: Promise.resolve({ brandId: BRAND_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ groups: [], paused: true });
  });

  it("the same is true when QUERY_SIMULATION_ENABLED is unset entirely (not just 'false')", async () => {
    vi.unstubAllEnvs();
    delete process.env.QUERY_SIMULATION_ENABLED;

    const res = await getFanOut(
      makeReq(`/api/brands/${BRAND_ID}/fan-out`),
      { params: Promise.resolve({ brandId: BRAND_ID }) },
    );
    const body = await res.json();
    expect(body).toEqual({ groups: [], paused: true });
  });
});

describe("fan-out route while QUERY_SIMULATION_ENABLED=true -- today's behaviour, unchanged", () => {
  beforeEach(() => {
    vi.stubEnv("QUERY_SIMULATION_ENABLED", "true");
  });

  it("returns the real, already-seeded group -- paused is absent, not false", async () => {
    const res = await getFanOut(
      makeReq(`/api/brands/${BRAND_ID}/fan-out?auditId=${AUDIT_ID}`),
      { params: Promise.resolve({ brandId: BRAND_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paused).toBeUndefined();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].originalPrompt).toBe("best plumber in Bondi");
  });
});
