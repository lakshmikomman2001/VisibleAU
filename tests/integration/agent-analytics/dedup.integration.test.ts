import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import postgres from "postgres";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/visibleau";
  process.env.SERVICE_DATABASE_URL = process.env.SERVICE_DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/visibleau";
});

vi.mock("dns", () => ({
  promises: {
    reverse: vi.fn().mockRejectedValue(new Error("NXDOMAIN")),
    resolve4: vi.fn().mockRejectedValue(new Error("NXDOMAIN")),
    resolve6: vi.fn().mockRejectedValue(new Error("NXDOMAIN")),
    resolveTxt: vi.fn().mockRejectedValue(new Error("NXDOMAIN")),
  },
}));

import {
  TEST_DB_URL,
  TEST_ORG_ID,
  TEST_BRAND_ID,
  TEST_DOMAIN,
  createClient,
  assertDevDatabase,
  seedOrgAndBrand,
  cleanupAll,
} from "./_fixtures";

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  client = createClient();
  await assertDevDatabase(client);
  await seedOrgAndBrand(client);

  process.env.DATABASE_URL = process.env.DATABASE_URL ?? TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = process.env.SERVICE_DATABASE_URL ?? TEST_DB_URL;
});

afterEach(async () => {
  await client`DELETE FROM crawler_visit_logs WHERE brand_id = ${TEST_BRAND_ID}`.catch(() => {});
});

afterAll(async () => {
  await cleanupAll(client);
  await client.end();
});

async function ingestSyntheticLog() {
  const { readFileSync } = await import("fs");
  const { resolve } = await import("path");
  const { parseCrawlerLog } = await import("@/lib/agent-analytics/parse-crawler-log");
  const { clearRegistryCache } = await import("@/lib/agent-analytics/bot-registry");

  clearRegistryCache();

  const logPath = resolve(process.cwd(), "test-fixtures/agent-analytics/metro-synthetic.log");
  const logContent = readFileSync(logPath);
  const result = await parseCrawlerLog(logContent, "metro-synthetic.log");

  let count = 0;
  for (const hit of result.hits) {
    await client`
      INSERT INTO crawler_visit_logs (
        brand_id, organization_id, crawler_name, crawler_tier,
        visited_url, status_code, is_active_agent, referrer_ai_session,
        visit_purpose, visited_at, source_ip, bytes, ingest_source
      ) VALUES (
        ${TEST_BRAND_ID}, ${TEST_ORG_ID}, ${hit.registryMatch.uaToken},
        ${hit.registryMatch.crawlerTier},
        ${"https://" + TEST_DOMAIN + hit.path}, ${hit.statusCode},
        ${hit.registryMatch.isAgentUa}, ${hit.registryMatch.aiPlatform},
        ${hit.registryMatch.defaultPurpose}, ${hit.timestamp},
        ${hit.sourceIp}, ${hit.bytes || null}, 'log_upload'
      ) ON CONFLICT DO NOTHING
    `;
    count++;
  }
  return { count, parseResult: result };
}

async function getRowCount(): Promise<number> {
  const [row] = await client`
    SELECT count(*)::int AS n FROM crawler_visit_logs WHERE brand_id = ${TEST_BRAND_ID}
  `;
  return row.n;
}

// ── Group F: Dedup (AA-02) — locks FIX-02 ──

describe("F1: re-ingest identical file → row count unchanged", () => {
  it("first ingest → 8 rows, second ingest → still 8", async () => {
    await ingestSyntheticLog();
    expect(await getRowCount()).toBe(8);

    await ingestSyntheticLog();
    expect(await getRowCount()).toBe(8);
  });
});

describe("F2: genuinely-new line still inserts (discriminating proof)", () => {
  it("after double-ingest at 8, a variant with one changed URL → count 9", async () => {
    await ingestSyntheticLog();
    await ingestSyntheticLog();
    expect(await getRowCount()).toBe(8);

    await client`
      INSERT INTO crawler_visit_logs (
        brand_id, organization_id, crawler_name, crawler_tier,
        visited_url, status_code, is_active_agent,
        visit_purpose, visited_at, source_ip, ingest_source
      ) VALUES (
        ${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'GPTBot', 'must_allow',
        ${"https://" + TEST_DOMAIN + "/new-page-f2"}, 200,
        false, 'indexing',
        '2026-07-16T08:00:01+10:00'::timestamptz,
        '203.0.113.10', 'log_upload'
      )
    `;

    expect(await getRowCount()).toBe(9);
  });
});
