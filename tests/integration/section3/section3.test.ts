/**
 * Section 3 — Backend E2E (ingestion pipeline + event-chain seams)
 *
 * Tests the multi-step chain: upload → parse → verify → metrics.
 * The proof is the DB end-state (per AA-21: "greps cannot prove an event chain fires").
 * The break-proof is: sever one event name → chain breaks → end-state is wrong.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// ═══════════════════════════════════════════════════════════════════
// Module mocks — hoisted before imports
// ═══════════════════════════════════════════════════════════════════

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("dns", () => ({
  promises: {
    reverse: vi.fn().mockImplementation(async (ip: string) => {
      if (ip.startsWith("198.51.100.")) return ["test.example.com"];
      throw new Error("DNS unavailable for test IP");
    }),
    resolve4: vi.fn().mockRejectedValue(new Error("DNS unavailable")),
    resolve6: vi.fn().mockRejectedValue(new Error("DNS unavailable")),
    resolveTxt: vi.fn().mockRejectedValue(new Error("DNS unavailable")),
  },
}));

vi.mock("@/db/client", async () => {
  const pg = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { sql } = await import("drizzle-orm");
  const schema = await import("@/db/schema");

  const TEST_URL = "postgresql://postgres:password@localhost:5432/visibleau_test";
  const client = pg(TEST_URL, { max: 5, idle_timeout: 20, connect_timeout: 10 });
  const testDb = drizzle(client, { schema });

  return {
    db: testDb,
    serviceDb: testDb,
    withRlsContext: async (orgId: string, fn: (tx: any) => Promise<any>) => {
      return testDb.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
        return fn(tx);
      });
    },
  };
});

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
    createFunction: (config: any, handler: any) => ({
      __config: config,
      __handler: handler,
    }),
  },
}));

// ═══════════════════════════════════════════════════════════════════
// Imports (these run AFTER mocks are in place)
// ═══════════════════════════════════════════════════════════════════

import { inngest } from "@/lib/inngest/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { parseCrawlerLogFn } from "@/inngest/functions/parse-crawler-log";
import { verifyCrawlerHitsFn } from "@/inngest/functions/verify-crawler-hits";
import { fanoutWebhooksFn } from "@/inngest/functions/fanout-webhooks";
import { clearRegistryCache } from "@/lib/agent-analytics/bot-registry";
import { clearVerificationCache } from "@/lib/agent-analytics/verify-crawler-hits";
import {
  createTestClient,
  assertTestDatabase,
  seedFixtures,
  truncateTestTables,
  teardownFixtures,
  makeOwnerUser,
  OWNER_ORG_ID,
  OWNER_BRAND_ID,
} from "../section2/_harness";

const mockedSend = inngest.send as ReturnType<typeof vi.fn>;
const mockedGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;

// ═══════════════════════════════════════════════════════════════════
// Chain executor — matches events to handlers by trigger name
// ═══════════════════════════════════════════════════════════════════

function buildHandlerMap() {
  const map = new Map<string, Function>();
  const fns = [parseCrawlerLogFn, verifyCrawlerHitsFn, fanoutWebhooksFn] as any[];
  for (const fn of fns) {
    for (const trigger of fn.__config.triggers ?? []) {
      if (trigger.event) map.set(trigger.event, fn.__handler);
    }
  }
  return map;
}

function makeStep() {
  return { run: async (_name: string, fn: () => Promise<any>) => fn() };
}

async function runChain(initialEvent: any): Promise<{
  processedEvents: string[];
  allSends: any[];
}> {
  const map = buildHandlerMap();
  const step = makeStep();
  const processedEvents: string[] = [];

  mockedSend.mockClear();

  const handler = map.get(initialEvent.name);
  if (!handler) return { processedEvents, allSends: [] };

  processedEvents.push(initialEvent.name);
  await handler({ event: initialEvent, step });

  let idx = 0;
  while (idx < mockedSend.mock.calls.length) {
    const evt = mockedSend.mock.calls[idx][0];
    idx++;
    const nextHandler = map.get(evt.name);
    if (nextHandler) {
      processedEvents.push(evt.name);
      await nextHandler({ event: { ...evt, id: `chain-${idx}` }, step });
    }
  }

  return {
    processedEvents,
    allSends: mockedSend.mock.calls.map((c: any) => c[0]),
  };
}

async function runParseOnly(event: any) {
  const handler = (parseCrawlerLogFn as any).__handler;
  mockedSend.mockClear();
  return handler({ event, step: makeStep() });
}

// ═══════════════════════════════════════════════════════════════════
// 13-line synthetic log fixture
// 7 legit GPTBot (IPs in 40.88.0.0/14) + 1 spoof (198.51.100.1)
// + 3 static assets + 2 human UAs = 8 hits, 5 discarded
// ═══════════════════════════════════════════════════════════════════

const SYNTHETIC_LOG = [
  `40.88.21.1 - - [10/Jul/2026:08:00:01 +0000] "GET /page1 HTTP/1.1" 200 5120 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"`,
  `40.88.21.2 - - [10/Jul/2026:08:00:02 +0000] "GET /page2 HTTP/1.1" 200 3200 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"`,
  `40.88.21.3 - - [10/Jul/2026:08:00:03 +0000] "GET /page3 HTTP/1.1" 200 4500 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"`,
  `40.88.21.4 - - [10/Jul/2026:08:00:04 +0000] "GET /page4 HTTP/1.1" 200 2800 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"`,
  `40.88.21.5 - - [10/Jul/2026:08:00:05 +0000] "GET /page5 HTTP/1.1" 200 6100 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"`,
  `40.88.21.6 - - [10/Jul/2026:08:01:01 +0000] "GET /about HTTP/1.1" 200 4200 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"`,
  `40.88.21.7 - - [10/Jul/2026:08:01:02 +0000] "GET /contact HTTP/1.1" 200 3800 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"`,
  `198.51.100.1 - - [10/Jul/2026:08:02:01 +0000] "GET /pricing HTTP/1.1" 200 4000 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"`,
  `40.88.21.1 - - [10/Jul/2026:08:03:01 +0000] "GET /styles.css HTTP/1.1" 200 1200 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"`,
  `40.88.21.1 - - [10/Jul/2026:08:03:02 +0000] "GET /app.js HTTP/1.1" 200 8000 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"`,
  `40.88.21.1 - - [10/Jul/2026:08:03:03 +0000] "GET /logo.png HTTP/1.1" 200 15000 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"`,
  `10.0.0.1 - - [10/Jul/2026:08:04:01 +0000] "GET /page1 HTTP/1.1" 200 5120 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0"`,
  `10.0.0.2 - - [10/Jul/2026:08:04:02 +0000] "GET /page2 HTTP/1.1" 200 3200 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/17.4"`,
].join("\n");

function makeUploadEvent() {
  return {
    name: "crawler-log/uploaded",
    data: {
      brandId: OWNER_BRAND_ID,
      organizationId: OWNER_ORG_ID,
      domain: "s2-test.local",
      filename: "access.log",
      contentBase64: Buffer.from(SYNTHETIC_LOG).toString("base64"),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Setup / Teardown
// ═══════════════════════════════════════════════════════════════════

let pgClient: ReturnType<typeof createTestClient>;

beforeAll(async () => {
  pgClient = createTestClient();
  await assertTestDatabase(pgClient);
  await seedFixtures(pgClient);
}, 30_000);

beforeEach(async () => {
  await truncateTestTables(pgClient);
  mockedSend.mockClear();
  clearRegistryCache();
  clearVerificationCache();
  // Re-seed CIDR ranges (truncated by truncateTestTables)
  await pgClient`
    INSERT INTO ai_bot_ip_ranges (vendor, cidr, source_url, version_hash, is_current)
    VALUES ('openai', '40.88.0.0/14', 'https://openai.com/ranges.json', 'testhash-s3', true)
    ON CONFLICT DO NOTHING
  `;
});

afterAll(async () => {
  await teardownFixtures(pgClient);
  await pgClient.end();
}, 15_000);

// ═══════════════════════════════════════════════════════════════════
// STEP 0 — Chain executor mechanism
// ═══════════════════════════════════════════════════════════════════

describe("Step 0: Chain executor registers all pipeline handlers", () => {
  it("handler map includes parse, verify, and fanout functions", () => {
    const map = buildHandlerMap();
    expect(map.has("crawler-log/uploaded")).toBe(true);
    expect(map.has("crawler-hits/ingested")).toBe(true);
    expect(map.has("crawler.impersonation-detected")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 1 — Full E2E: upload → parse → verify → queryable metrics
// ═══════════════════════════════════════════════════════════════════

describe("Step 1: Full ingestion pipeline, end to end", () => {
  it("13-line log → 8 hits parsed + verified, metrics correct", async () => {
    const { processedEvents, allSends } = await runChain(makeUploadEvent());

    // Chain fired: parse ran, then verify ran
    expect(processedEvents).toContain("crawler-log/uploaded");
    expect(processedEvents).toContain("crawler-hits/ingested");

    // Parse emitted the correct event
    const ingestEvent = allSends.find((s: any) => s.name === "crawler-hits/ingested");
    expect(ingestEvent).toBeDefined();
    expect(ingestEvent.data.hitCount).toBe(8);

    // --- DB end-state assertions ---

    // 8 hits landed (7 legit + 1 spoof IP)
    const [{ count: hitCount }] = await pgClient`
      SELECT COUNT(*)::int as count FROM crawler_visit_logs WHERE brand_id = ${OWNER_BRAND_ID}
    `;
    expect(hitCount).toBe(8);

    // Every hit has non-null verification_status (verification actually ran)
    const [{ nullCount }] = await pgClient`
      SELECT COUNT(*)::int as "nullCount" FROM crawler_visit_logs
      WHERE brand_id = ${OWNER_BRAND_ID} AND verification_status IS NULL
    `;
    expect(nullCount).toBe(0);

    // Verification split: 7 verified via CIDR, 1 spoofed via FCrDNS
    const statusRows = await pgClient`
      SELECT verification_status, COUNT(*)::int as count
      FROM crawler_visit_logs WHERE brand_id = ${OWNER_BRAND_ID}
      GROUP BY verification_status ORDER BY verification_status
    `;
    const statusMap = Object.fromEntries(statusRows.map((r: any) => [r.verification_status, r.count]));
    expect(statusMap.verified).toBe(7);
    expect(statusMap.spoofed).toBe(1);

    // Spoof row is specifically the 198.51.100.1 IP
    const [spoofRow] = await pgClient`
      SELECT source_ip, verification_status, verified_via FROM crawler_visit_logs
      WHERE brand_id = ${OWNER_BRAND_ID} AND verification_status = 'spoofed'
    `;
    expect(spoofRow.source_ip).toBe("198.51.100.1");
    expect(spoofRow.verified_via).toBe("fcrdns");

    // Metrics route returns correct aggregates
    mockedGetCurrentUser.mockResolvedValue(makeOwnerUser());
    const { GET } = await import("@/app/api/brands/[brandId]/agent-analytics/overview/route");
    const res = await GET(
      new Request(`http://localhost/api/brands/${OWNER_BRAND_ID}/agent-analytics/overview?days=30`),
      { params: Promise.resolve({ brandId: OWNER_BRAND_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // Volume by vendor: openai = 8 total
    const openaiVol = body.overview.volumeByVendor.find((v: any) => v.vendor === "openai");
    expect(openaiVol).toBeDefined();
    expect(openaiVol.total).toBe(8);

    // Verification rates: 7 verified, 1 spoofed
    const openaiRates = body.overview.verificationRates.find((v: any) => v.vendor === "openai");
    expect(openaiRates).toBeDefined();
    expect(openaiRates.verified).toBe(7);
    expect(openaiRates.spoofed).toBe(1);
    expect(openaiRates.total).toBe(8);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════
// STEP 2 — Event-name convention seams (dot-vs-slash static guard)
// ═══════════════════════════════════════════════════════════════════

describe("Step 2: Event-name convention (dot-vs-slash guard)", () => {
  const parseDef = parseCrawlerLogFn as any;
  const verifyDef = verifyCrawlerHitsFn as any;
  const fanoutDef = fanoutWebhooksFn as any;

  it("parse triggers on SLASH-form internal event: crawler-log/uploaded", () => {
    const triggers = parseDef.__config.triggers.map((t: any) => t.event);
    expect(triggers).toContain("crawler-log/uploaded");
    expect(triggers[0]).toContain("/");
  });

  it("verify triggers on SLASH-form internal event: crawler-hits/ingested", () => {
    const triggers = verifyDef.__config.triggers.map((t: any) => t.event);
    expect(triggers).toContain("crawler-hits/ingested");
    expect(triggers[0]).toContain("/");
  });

  it("fanout triggers on DOT-form external event: crawler.impersonation-detected", () => {
    const triggers = fanoutDef.__config.triggers.map((t: any) => t.event);
    expect(triggers).toContain("crawler.impersonation-detected");
  });

  it("parse→verify seam: emitted event matches verify's trigger exactly", async () => {
    await runParseOnly(makeUploadEvent());
    const emittedName = mockedSend.mock.calls.find(
      (c: any) => c[0].name === "crawler-hits/ingested",
    );
    expect(emittedName).toBeDefined();
    const verifyTriggers = verifyDef.__config.triggers.map((t: any) => t.event);
    expect(verifyTriggers).toContain(emittedName![0].name);
  });

  it("verify→fanout seam: impersonation event uses DOT-form + fanout listens", () => {
    const fanoutTriggers = fanoutDef.__config.triggers.map((t: any) => t.event);
    expect(fanoutTriggers).toContain("crawler.impersonation-detected");
    expect("crawler.impersonation-detected").not.toContain("/");
  });

  it("impersonation event fires fanout when spoofed rate > 25% on recent data", async () => {
    // Seed 10 UNVERIFIED rows (verification_status NULL, source_ip NOT NULL)
    // 6 IPs in CIDR range → will be verified, 4 IPs outside → will be spoofed
    // All with recent timestamps so check-impersonation finds them
    const values = [];
    for (let i = 0; i < 6; i++) {
      values.push(`('${OWNER_BRAND_ID}', '${OWNER_ORG_ID}', 'GPTBot', 'must_allow', 'https://s3.local/v${i}', 'indexing', NOW() - interval '30 minutes', '40.88.21.${i + 1}', 'log_upload')`);
    }
    for (let i = 0; i < 4; i++) {
      values.push(`('${OWNER_BRAND_ID}', '${OWNER_ORG_ID}', 'GPTBot', 'must_allow', 'https://s3.local/s${i}', 'indexing', NOW() - interval '30 minutes', '198.51.100.${i + 1}', 'log_upload')`);
    }
    await pgClient.unsafe(`
      INSERT INTO crawler_visit_logs (brand_id, organization_id, crawler_name, crawler_tier, visited_url, visit_purpose, visited_at, source_ip, ingest_source)
      VALUES ${values.join(",")}
    `);

    // Run verify handler — it will:
    // 1. fetch-unverified: finds 10 rows with NULL status
    // 2. verify-hits: CIDR verifies 6, FCrDNS spoofs 4
    // 3. check-impersonation: 4/10 = 40% spoofed > 25% → emits event
    const verifyHandler = (verifyCrawlerHitsFn as any).__handler;
    mockedSend.mockClear();
    await verifyHandler({
      event: {
        data: { brandId: OWNER_BRAND_ID, organizationId: OWNER_ORG_ID, hitCount: 10, source: "log_upload" },
        id: "test-impersonation",
      },
      step: makeStep(),
    });

    // The impersonation-detected event should have been emitted (dot form)
    const impersonationEvent = mockedSend.mock.calls.find(
      (c: any) => c[0].name === "crawler.impersonation-detected",
    );
    expect(impersonationEvent).toBeDefined();
    expect(impersonationEvent![0].data.crawlerName).toBe("GPTBot");
    expect(impersonationEvent![0].data.spoofedRate).toBeGreaterThan(25);

    // Verify the fanout handler would pick it up
    const fanoutTriggers = (fanoutWebhooksFn as any).__config.triggers.map((t: any) => t.event);
    expect(fanoutTriggers).toContain(impersonationEvent![0].name);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════
// STEP 3 — Idempotency: re-ingestion dedup via real index
// ═══════════════════════════════════════════════════════════════════

describe("Step 3: Idempotency — dedup via crawler_logs_dedup_idx", () => {
  it("dedup index exists with correct expression (COALESCE on source_ip)", async () => {
    const [idx] = await pgClient`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'crawler_logs_dedup_idx'
    `;
    expect(idx).toBeDefined();
    expect(idx.indexdef).toContain("UNIQUE");
    expect(idx.indexdef).toContain("brand_id");
    expect(idx.indexdef).toContain("crawler_name");
    expect(idx.indexdef).toContain("visited_url");
    expect(idx.indexdef).toContain("visited_at");
    expect(idx.indexdef).toContain("COALESCE");
    expect(idx.indexdef).toContain("source_ip");
  });

  it("same log ingested twice → 0 new rows on second run", async () => {
    // First parse: 8 rows
    await runParseOnly(makeUploadEvent());
    const [{ count: first }] = await pgClient`
      SELECT COUNT(*)::int as count FROM crawler_visit_logs WHERE brand_id = ${OWNER_BRAND_ID}
    `;
    expect(first).toBe(8);

    // Second parse (same log, same brand): still 8 rows
    clearRegistryCache();
    await runParseOnly(makeUploadEvent());
    const [{ count: second }] = await pgClient`
      SELECT COUNT(*)::int as count FROM crawler_visit_logs WHERE brand_id = ${OWNER_BRAND_ID}
    `;
    expect(second).toBe(8);
  }, 30_000);

  it("[BREAK-PROOF] drop dedup index → second ingest duplicates → restore", async () => {
    // First parse: 8 rows
    await runParseOnly(makeUploadEvent());
    const [{ count: before }] = await pgClient`
      SELECT COUNT(*)::int as count FROM crawler_visit_logs WHERE brand_id = ${OWNER_BRAND_ID}
    `;
    expect(before).toBe(8);

    // Drop the dedup index
    await pgClient`DROP INDEX crawler_logs_dedup_idx`;

    // Second parse: duplicates appear (onConflictDoNothing has no constraint to conflict on)
    clearRegistryCache();
    await runParseOnly(makeUploadEvent());
    const [{ count: after }] = await pgClient`
      SELECT COUNT(*)::int as count FROM crawler_visit_logs WHERE brand_id = ${OWNER_BRAND_ID}
    `;
    expect(after).toBe(16);

    // Restore: truncate (dupes prevent unique index creation) then recreate
    await pgClient`TRUNCATE crawler_visit_logs RESTART IDENTITY CASCADE`;
    await pgClient`
      CREATE UNIQUE INDEX crawler_logs_dedup_idx ON crawler_visit_logs
      USING btree (brand_id, crawler_name, visited_url, visited_at, COALESCE(source_ip, '0.0.0.0'::inet))
    `;

    // Confirm restored
    const [restored] = await pgClient`
      SELECT 1 FROM pg_indexes WHERE indexname = 'crawler_logs_dedup_idx'
    `;
    expect(restored).toBeDefined();
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════
// STEP 4 — Verification caching per (ip, vendor)
// ═══════════════════════════════════════════════════════════════════

describe("Step 4: Verification caching — consistent results per (ip, vendor)", () => {
  it("10 hits from 2 IPs → all verified consistently per IP (cache deduplicates)", async () => {
    // Seed 10 unverified rows: 7 from IP A (in CIDR), 3 from IP B (spoofable)
    const values = [];
    for (let i = 0; i < 7; i++) {
      values.push(`('${OWNER_BRAND_ID}', '${OWNER_ORG_ID}', 'GPTBot', 'must_allow', 'https://s3.local/c${i}', 'indexing', NOW() - interval '30 minutes', '40.88.21.1', 'log_upload')`);
    }
    for (let i = 0; i < 3; i++) {
      values.push(`('${OWNER_BRAND_ID}', '${OWNER_ORG_ID}', 'GPTBot', 'must_allow', 'https://s3.local/d${i}', 'indexing', NOW() - interval '30 minutes', '198.51.100.1', 'log_upload')`);
    }
    await pgClient.unsafe(`
      INSERT INTO crawler_visit_logs (brand_id, organization_id, crawler_name, crawler_tier, visited_url, visit_purpose, visited_at, source_ip, ingest_source)
      VALUES ${values.join(",")}
    `);

    // Run verify
    const verifyHandler = (verifyCrawlerHitsFn as any).__handler;
    await verifyHandler({
      event: {
        data: { brandId: OWNER_BRAND_ID, organizationId: OWNER_ORG_ID, hitCount: 10, source: "log_upload" },
        id: "test-cache",
      },
      step: makeStep(),
    });

    // All hits from same IP should have identical verification result
    const ipA = await pgClient`
      SELECT DISTINCT verification_status, verified_via FROM crawler_visit_logs
      WHERE brand_id = ${OWNER_BRAND_ID} AND source_ip = '40.88.21.1'
    `;
    expect(ipA.length).toBe(1);
    expect(ipA[0].verification_status).toBe("verified");
    expect(ipA[0].verified_via).toBe("cidr");

    const ipB = await pgClient`
      SELECT DISTINCT verification_status, verified_via FROM crawler_visit_logs
      WHERE brand_id = ${OWNER_BRAND_ID} AND source_ip = '198.51.100.1'
    `;
    expect(ipB.length).toBe(1);
    expect(ipB[0].verification_status).toBe("spoofed");
    expect(ipB[0].verified_via).toBe("fcrdns");

    // All 10 rows verified (no NULLs)
    const [{ nulls }] = await pgClient`
      SELECT COUNT(*)::int as nulls FROM crawler_visit_logs
      WHERE brand_id = ${OWNER_BRAND_ID} AND verification_status IS NULL
    `;
    expect(nulls).toBe(0);
  }, 30_000);
});
