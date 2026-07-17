import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import postgres from "postgres";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/visibleau";
  process.env.SERVICE_DATABASE_URL = process.env.SERVICE_DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/visibleau";
});

vi.mock("dns", () => ({
  promises: {
    reverse: vi.fn(),
    resolve4: vi.fn(),
    resolve6: vi.fn(),
    resolveTxt: vi.fn(),
  },
}));

import {
  TEST_DB_URL,
  createClient,
  assertDevDatabase,
  cleanupTestIpRanges,
} from "./_fixtures";

import { refreshIpRangesForVendor } from "@/lib/agent-analytics/ip-ranges";

const TEST_VENDOR = "p3s1-test-vendor";
const TEST_SOURCE_URL = "https://test.example.com/ranges.json";

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  client = createClient();
  await assertDevDatabase(client);

  process.env.DATABASE_URL = process.env.DATABASE_URL ?? TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = process.env.SERVICE_DATABASE_URL ?? TEST_DB_URL;
});

afterEach(async () => {
  await cleanupTestIpRanges(client);
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanupTestIpRanges(client);
  await client.end();
});

// ── Group H: IP-range refresh fails closed (AA-06) ──

describe("H1: malformed vendor JSON → fails closed, previous is_current retained", () => {
  it("malformed JSON does not wipe known-good current ranges", async () => {
    await client`
      INSERT INTO ai_bot_ip_ranges (vendor, cidr, source_url, version_hash, is_current)
      VALUES
        (${TEST_VENDOR}, '10.0.0.0/8', ${TEST_SOURCE_URL}, 'known-good-hash', true),
        (${TEST_VENDOR}, '172.16.0.0/12', ${TEST_SOURCE_URL}, 'known-good-hash', true)
    `;

    const beforeRows = await client`
      SELECT count(*)::int AS n FROM ai_bot_ip_ranges
      WHERE vendor = ${TEST_VENDOR} AND is_current = true
    `;
    expect(beforeRows[0].n).toBe(2);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("this is not json at all {{{{", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await refreshIpRangesForVendor(TEST_VENDOR, TEST_SOURCE_URL);

    globalThis.fetch = originalFetch;

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Malformed JSON");

    const afterRows = await client`
      SELECT count(*)::int AS n FROM ai_bot_ip_ranges
      WHERE vendor = ${TEST_VENDOR} AND is_current = true
    `;
    expect(afterRows[0].n).toBe(2);
  });

  it("empty prefix list → fails closed (AA-06)", async () => {
    await client`
      INSERT INTO ai_bot_ip_ranges (vendor, cidr, source_url, version_hash, is_current)
      VALUES (${TEST_VENDOR}, '10.0.0.0/8', ${TEST_SOURCE_URL}, 'known-good-hash', true)
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ prefixes: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await refreshIpRangesForVendor(TEST_VENDOR, TEST_SOURCE_URL);

    globalThis.fetch = originalFetch;

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Empty prefix list");

    const afterRows = await client`
      SELECT count(*)::int AS n FROM ai_bot_ip_ranges
      WHERE vendor = ${TEST_VENDOR} AND is_current = true
    `;
    expect(afterRows[0].n).toBe(1);
  });

  it("unexpected JSON schema → fails closed (AA-06)", async () => {
    await client`
      INSERT INTO ai_bot_ip_ranges (vendor, cidr, source_url, version_hash, is_current)
      VALUES (${TEST_VENDOR}, '10.0.0.0/8', ${TEST_SOURCE_URL}, 'known-good-hash', true)
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ something: "unexpected" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await refreshIpRangesForVendor(TEST_VENDOR, TEST_SOURCE_URL);

    globalThis.fetch = originalFetch;

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Unexpected JSON schema");

    const afterRows = await client`
      SELECT count(*)::int AS n FROM ai_bot_ip_ranges
      WHERE vendor = ${TEST_VENDOR} AND is_current = true
    `;
    expect(afterRows[0].n).toBe(1);
  });
});
