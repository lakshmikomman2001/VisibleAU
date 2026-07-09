import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import postgres from "postgres";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

const ORG = "d1d1d1d1-0001-4000-a000-000000000001";
const BRAND = "d1d1d1d1-0001-4000-a000-000000000011";
const TOKEN = "s6-visit-route-test-token-xyz";
const DOMAIN = "visit-route-test.example.com";

let client: ReturnType<typeof postgres>;
let POST: (req: Request) => Promise<Response>;
let inngestSend: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = process.env.SERVICE_DATABASE_URL ?? TEST_DB_URL;

  client = postgres(TEST_DB_URL, { max: 1 });
  await client`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${ORG}, 'vr-test', 'VR Test', 'vr-test') ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, brand_token) VALUES (${BRAND}, ${ORG}, 'VR Brand', ${DOMAIN}, 'tradies', 'au', ARRAY['VIC:Melbourne'], ${TOKEN}) ON CONFLICT (id) DO UPDATE SET brand_token = ${TOKEN}`;

  const routeMod = await import("@/app/api/visit/route");
  POST = routeMod.POST;
  const inngestMod = await import("@/lib/inngest/client");
  inngestSend = inngestMod.inngest.send as ReturnType<typeof vi.fn>;
});

afterAll(async () => {
  await client`DELETE FROM brands WHERE id = ${BRAND}`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${ORG}`.catch(() => {});
  await client.end();
});

beforeEach(() => {
  inngestSend.mockClear();
});

function req(body: object, ip = "10.0.0.1") {
  return new Request("http://localhost:3000/api/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("visit route — public API (§9.1, MW-01, BT-01)", () => {
  it("valid brandToken → 202 + emits visit/ingested", async () => {
    const res = await POST(req({
      brandToken: TOKEN,
      url: `https://${DOMAIN}/services`,
      userAgent: "GPTBot/1.0",
    }, "10.0.1.1"));
    expect(res.status).toBe(202);
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "visit/ingested",
        data: expect.objectContaining({
          brandId: BRAND,
          organizationId: ORG,
        }),
      }),
    );
  });

  it("invalid brandToken → 401 (BT-01)", async () => {
    const res = await POST(req({
      brandToken: "nonexistent-token-xyz",
      url: "https://whatever.com/page",
      userAgent: "Bot/1.0",
    }, "10.0.1.2"));
    expect(res.status).toBe(401);
  });

  it("absent brandToken → 400 (validation)", async () => {
    const res = await POST(req({
      url: "https://whatever.com/page",
      userAgent: "Bot/1.0",
    }, "10.0.1.3"));
    expect(res.status).toBe(400);
  });

  it("rate limit → 429 after 200 requests from same IP", async () => {
    const rateIp = "10.99.0.1";
    for (let i = 0; i < 200; i++) {
      await POST(req({ brandToken: "bad-rate", url: "https://x.com/p", userAgent: "B" }, rateIp));
    }
    const res = await POST(req({ brandToken: "bad-rate", url: "https://x.com/p", userAgent: "B" }, rateIp));
    expect(res.status).toBe(429);
  });

  it("/api/visit is in middleware PUBLIC_ROUTES (MW-01)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("middleware.ts", "utf-8");
    expect(src).toContain('"/api/visit"');
  });
});
