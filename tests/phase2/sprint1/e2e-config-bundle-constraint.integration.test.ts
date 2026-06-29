import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { configBundleCache } from "@/db/schema/config-bundle-cache";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client);
});

afterEach(async () => {
  await client`DELETE FROM config_bundle_cache WHERE market_code = 'TEST_XX'`;
});

afterAll(async () => {
  await client.end();
});

describe("E2E: config_bundle_cache partial unique index", () => {
  it("allows one active bundle per market+locale+segment", async () => {
    const [inserted] = await db
      .insert(configBundleCache)
      .values({
        marketCode: "TEST_XX",
        locale: "en-XX",
        segment: "smb",
        bundleVersion: 1,
        configDigest: "digest1",
        resolvedConfig: { test: true },
        isActive: true,
      })
      .returning();

    expect(inserted.isActive).toBe(true);
  });

  it("rejects a second active bundle for the same tuple", async () => {
    await db.insert(configBundleCache).values({
      marketCode: "TEST_XX",
      locale: "en-XX",
      segment: "smb",
      bundleVersion: 1,
      configDigest: "digest1",
      resolvedConfig: { test: true },
      isActive: true,
    });

    await expect(
      db.insert(configBundleCache).values({
        marketCode: "TEST_XX",
        locale: "en-XX",
        segment: "smb",
        bundleVersion: 2,
        configDigest: "digest2",
        resolvedConfig: { test: true, v: 2 },
        isActive: true,
      }),
    ).rejects.toThrow();
  });

  it("allows multiple inactive bundles for the same tuple", async () => {
    await db.insert(configBundleCache).values({
      marketCode: "TEST_XX",
      locale: "en-XX",
      segment: "smb",
      bundleVersion: 1,
      configDigest: "digest1",
      resolvedConfig: { v: 1 },
      isActive: false,
    });

    const [second] = await db
      .insert(configBundleCache)
      .values({
        marketCode: "TEST_XX",
        locale: "en-XX",
        segment: "smb",
        bundleVersion: 2,
        configDigest: "digest2",
        resolvedConfig: { v: 2 },
        isActive: false,
      })
      .returning();

    expect(second).toBeDefined();
  });

  it("allows one active + one inactive for the same tuple", async () => {
    await db.insert(configBundleCache).values({
      marketCode: "TEST_XX",
      locale: "en-XX",
      segment: "smb",
      bundleVersion: 1,
      configDigest: "digest1",
      resolvedConfig: { v: 1 },
      isActive: true,
    });

    const [inactive] = await db
      .insert(configBundleCache)
      .values({
        marketCode: "TEST_XX",
        locale: "en-XX",
        segment: "smb",
        bundleVersion: 2,
        configDigest: "digest2",
        resolvedConfig: { v: 2 },
        isActive: false,
      })
      .returning();

    expect(inactive.isActive).toBe(false);
  });
});

describe("E2E: UNIQUE constraints on config tables", () => {
  it("market_ai_budget_policies rejects duplicate (market_code, segment, use_case)", async () => {
    await client`DELETE FROM market_ai_budget_policies WHERE market_code = 'TEST_XX'`;
    await client`
      INSERT INTO market_ai_budget_policies (market_code, segment, use_case)
      VALUES ('TEST_XX', 'smb', 'brand_audit')
    `;
    await expect(
      client`INSERT INTO market_ai_budget_policies (market_code, segment, use_case) VALUES ('TEST_XX', 'smb', 'brand_audit')`,
    ).rejects.toThrow();
    await client`DELETE FROM market_ai_budget_policies WHERE market_code = 'TEST_XX'`;
  });

  it("metric_quality_gates rejects duplicate (metric_key, market_code)", async () => {
    await client`DELETE FROM metric_quality_gates WHERE market_code = 'TEST_XX'`;
    await client`
      INSERT INTO metric_quality_gates (metric_key, market_code, minimum_samples)
      VALUES ('test_metric', 'TEST_XX', 5)
    `;
    await expect(
      client`INSERT INTO metric_quality_gates (metric_key, market_code, minimum_samples) VALUES ('test_metric', 'TEST_XX', 10)`,
    ).rejects.toThrow();
    await client`DELETE FROM metric_quality_gates WHERE market_code = 'TEST_XX'`;
  });
});
