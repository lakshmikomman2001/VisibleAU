import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import postgres from "postgres";

const { mockReverse, mockResolve4, mockResolve6, mockResolveTxt } = vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/visibleau";
  process.env.SERVICE_DATABASE_URL = process.env.SERVICE_DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/visibleau";
  return {
    mockReverse: vi.fn(),
    mockResolve4: vi.fn(),
    mockResolve6: vi.fn(),
    mockResolveTxt: vi.fn(),
  };
});

vi.mock("dns", () => ({
  promises: {
    reverse: mockReverse,
    resolve4: mockResolve4,
    resolve6: mockResolve6,
    resolveTxt: mockResolveTxt,
  },
}));

vi.mock("@/lib/agent-analytics/ip-ranges", () => ({
  checkCidrContainment: vi.fn().mockResolvedValue(false),
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

import { parseCrawlerLog } from "@/lib/agent-analytics/parse-crawler-log";
import { clearRegistryCache, lookupByUserAgent } from "@/lib/agent-analytics/bot-registry";
import {
  verifyCrawlerHit,
  clearVerificationCache,
} from "@/lib/agent-analytics/verify-crawler-hits";
import { classifyWithRegistry } from "@/lib/retrieval/visit-classifier";

let client: ReturnType<typeof postgres>;

function defaultDnsMocks() {
  mockReverse.mockRejectedValue(new Error("NXDOMAIN"));
  mockResolve4.mockRejectedValue(new Error("NXDOMAIN"));
  mockResolve6.mockRejectedValue(new Error("NXDOMAIN"));
  mockResolveTxt.mockRejectedValue(new Error("NXDOMAIN"));
}

beforeAll(async () => {
  client = createClient();
  await assertDevDatabase(client);

  await seedOrgAndBrand(client);
});

afterEach(async () => {
  await client`DELETE FROM crawler_visit_logs WHERE brand_id = ${TEST_BRAND_ID}`.catch(() => {});
  clearVerificationCache();
  clearRegistryCache();
  vi.clearAllMocks();
});

afterAll(async () => {
  await cleanupAll(client);
  await client.end();
});

async function runParsePipeline() {
  const { readFileSync } = await import("fs");
  const { resolve } = await import("path");

  clearRegistryCache();

  const logPath = resolve(process.cwd(), "test-fixtures/agent-analytics/metro-synthetic.log");
  const logContent = readFileSync(logPath);
  return parseCrawlerLog(logContent, "metro-synthetic.log");
}

async function insertHits(hits: Awaited<ReturnType<typeof runParsePipeline>>["hits"]) {
  let count = 0;
  for (const hit of hits) {
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
  return count;
}

async function verifyHits() {
  const unverified = await client`
    SELECT id, source_ip, crawler_name
    FROM crawler_visit_logs
    WHERE brand_id = ${TEST_BRAND_ID}
      AND verification_status IS NULL
      AND source_ip IS NOT NULL
  `;

  for (const hit of unverified) {
    const registry = await lookupByUserAgent(hit.crawler_name);
    if (!registry) {
      await client`
        UPDATE crawler_visit_logs
        SET verification_status = 'unverified', verified_via = NULL
        WHERE id = ${hit.id}
      `;
      continue;
    }

    const result = await verifyCrawlerHit(hit.source_ip, registry);
    await client`
      UPDATE crawler_visit_logs
      SET verification_status = ${result.status}, verified_via = ${result.verifiedVia}
      WHERE id = ${hit.id}
    `;
  }
}

// ── Group I: Direct-pipeline end-to-end ──

describe("I1: full pipeline matches WALK-01 answer key", () => {
  it("parse → insert → verify produces correct DB state", async () => {
    defaultDnsMocks();

    const parseResult = await runParsePipeline();

    expect(parseResult.totalLines).toBe(13);
    expect(parseResult.discardedStatic).toBe(3);
    expect(parseResult.discardedHuman).toBe(2);
    expect(parseResult.hits).toHaveLength(8);

    await insertHits(parseResult.hits);

    const rowCount = await client`
      SELECT count(*)::int AS n FROM crawler_visit_logs WHERE brand_id = ${TEST_BRAND_ID}
    `;
    expect(rowCount[0].n).toBe(8);

    await verifyHits();

    const rows = await client`
      SELECT crawler_name, source_ip, visited_url, visit_purpose,
             verification_status, verified_via, is_active_agent, ingest_source
      FROM crawler_visit_logs
      WHERE brand_id = ${TEST_BRAND_ID}
      ORDER BY visited_at
    `;

    expect(rows).toHaveLength(8);

    const verified = rows.filter((r: any) => r.verification_status === "verified");
    expect(verified).toHaveLength(0);

    const allLogUpload = rows.every((r: any) => r.ingest_source === "log_upload");
    expect(allLogUpload).toBe(true);

    const staticPresent = rows.some((r: any) =>
      r.visited_url?.includes(".css") ||
      r.visited_url?.includes(".js") ||
      r.visited_url?.includes(".png"),
    );
    expect(staticPresent).toBe(false);

    const spoofRow = rows.find((r: any) => r.source_ip === "198.51.100.99");
    expect(spoofRow).toBeDefined();
    expect(spoofRow.verification_status).not.toBe("verified");

    const agentBots = rows.filter((r: any) => r.is_active_agent === true);
    expect(agentBots.length).toBeGreaterThanOrEqual(2);
    const retrievalAgents = agentBots.filter((r: any) => r.visit_purpose === "retrieval");
    expect(retrievalAgents.length).toBeGreaterThanOrEqual(2);
  });
});

describe("I2: verify-then-classify ordering — spoofed row not classified as real visit", () => {
  it("spoofed row gets visitPurpose=null from classifyWithRegistry", async () => {
    mockReverse.mockImplementation(async (ip: string) => {
      if (ip === "198.51.100.99") return ["badguy.evil.com"];
      throw new Error("NXDOMAIN");
    });
    mockResolve4.mockRejectedValue(new Error("NXDOMAIN"));
    mockResolveTxt.mockRejectedValue(new Error("NXDOMAIN"));

    const parseResult = await runParsePipeline();
    await insertHits(parseResult.hits);
    await verifyHits();

    const spoofRow = await client`
      SELECT verification_status, crawler_name
      FROM crawler_visit_logs
      WHERE brand_id = ${TEST_BRAND_ID} AND source_ip = '198.51.100.99'
    `;
    expect(spoofRow).toHaveLength(1);
    expect(spoofRow[0].verification_status).toBe("spoofed");

    const classified = await classifyWithRegistry(
      "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)",
      5,
      spoofRow[0].verification_status,
    );

    expect(classified.visitPurpose).toBeNull();
    expect(classified.isActiveAgent).toBe(false);
  });
});
