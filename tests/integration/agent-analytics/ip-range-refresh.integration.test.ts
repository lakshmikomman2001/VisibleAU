import type postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/visibleau";
  process.env.SERVICE_DATABASE_URL =
    process.env.SERVICE_DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/visibleau";
});

vi.mock("dns", () => ({
  promises: {
    reverse: vi.fn(),
    resolve4: vi.fn(),
    resolve6: vi.fn(),
    resolveTxt: vi.fn(),
  },
}));

import { refreshIpRangesForVendor } from "@/lib/agent-analytics/ip-ranges";
import { assertDevDatabase, cleanupTestIpRanges, createClient, TEST_DB_URL } from "./_fixtures";

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

// ── Group I: Task #46 (11th follow-up) — (vendor, cidr) is the real
// natural key; re-ingesting must not duplicate, and the conflict target
// must actually be enforced at the DB level. ──

describe("I1: (vendor, cidr) unique constraint is enforced", () => {
  it("ai_bot_ip_ranges_vendor_cidr_unique exists and rejects a raw duplicate insert", async () => {
    const [constraint] = await client`
      SELECT conname FROM pg_constraint
      WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_unique'
        AND conrelid = 'ai_bot_ip_ranges'::regclass
    `;
    expect(constraint?.conname).toBe("ai_bot_ip_ranges_vendor_cidr_unique");

    await client`
      INSERT INTO ai_bot_ip_ranges (vendor, cidr, source_url, version_hash, is_current)
      VALUES (${TEST_VENDOR}, '198.51.100.0/24', ${TEST_SOURCE_URL}, 'hash-a', true)
    `;

    await expect(
      client`
        INSERT INTO ai_bot_ip_ranges (vendor, cidr, source_url, version_hash, is_current)
        VALUES (${TEST_VENDOR}, '198.51.100.0/24', ${TEST_SOURCE_URL}, 'hash-b', true)
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });
});

describe("I2: re-ingesting the same vendor ranges twice gives no duplicates", () => {
  it("refreshIpRangesForVendor called twice with the same list leaves exactly one row per range", async () => {
    // refreshIpRangesForVendor's second supported vendor-JSON shape: a
    // bare array of prefix strings (the first branch expects an array
    // of {ipv4Prefix|ipv6Prefix|ip_prefix} objects instead).
    const prefixes = ["203.0.113.0/24", "203.0.113.128/25"];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(prefixes), { status: 200 }));

    const first = await refreshIpRangesForVendor(TEST_VENDOR, TEST_SOURCE_URL);
    expect(first.status).toBe("updated");
    expect(first.rangeCount).toBe(2);

    // versionHash is computed from prefixes.sort(), so re-sending the
    // identical set in any order would hit the "unchanged" short-circuit
    // and never reach the insert loop at all -- add one genuinely new
    // range so this second call actually re-inserts the original two
    // (exercising onConflictDoUpdate on both) alongside a real insert.
    const secondPrefixes = [...prefixes, "203.0.113.200/32"];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(secondPrefixes), { status: 200 }));
    const second = await refreshIpRangesForVendor(TEST_VENDOR, TEST_SOURCE_URL);
    globalThis.fetch = originalFetch;

    expect(second.status).toBe("updated");
    expect(second.rangeCount).toBe(3);

    const rows = await client`
      SELECT cidr::text, is_current FROM ai_bot_ip_ranges WHERE vendor = ${TEST_VENDOR} ORDER BY cidr
    `;
    // 3 distinct ranges ever sent across both calls -> 3 rows, never 5.
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.is_current)).toBe(true);
  });
});

describe("I3: onConflictDoUpdate flips a previously-dropped range back to current", () => {
  it("a range re-appearing in a later refresh updates the existing row instead of inserting a second one", async () => {
    // Simulate a range from an OLD refresh that a later refresh dropped
    // (is_current = false), exactly the pre-0041 state that produced
    // duplicate rows when the ingest only knew how to INSERT.
    await client`
      INSERT INTO ai_bot_ip_ranges (vendor, cidr, source_url, version_hash, is_current, fetched_at)
      VALUES (${TEST_VENDOR}, '192.0.2.0/24', ${TEST_SOURCE_URL}, 'stale-hash', false, now() - interval '7 days')
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(["192.0.2.0/24"]), { status: 200 }));
    const result = await refreshIpRangesForVendor(TEST_VENDOR, TEST_SOURCE_URL);
    globalThis.fetch = originalFetch;

    expect(result.status).toBe("updated");

    const rows = await client`
      SELECT is_current, version_hash, fetched_at FROM ai_bot_ip_ranges
      WHERE vendor = ${TEST_VENDOR} AND cidr = '192.0.2.0/24'::cidr
    `;
    // The dedupe/conflict target keeps exactly one row per (vendor, cidr) --
    // the stale row is updated in place, never duplicated.
    expect(rows).toHaveLength(1);
    expect(rows[0].is_current).toBe(true);
    expect(rows[0].version_hash).not.toBe("stale-hash");
  });
});
