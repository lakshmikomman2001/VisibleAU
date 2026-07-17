import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import postgres from "postgres";

const { mockReverse, mockResolve4, mockResolve6, mockResolveTxt } = vi.hoisted(() => ({
  mockReverse: vi.fn(),
  mockResolve4: vi.fn(),
  mockResolve6: vi.fn(),
  mockResolveTxt: vi.fn(),
}));

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
  createClient,
  assertDevDatabase,
} from "./_fixtures";

import {
  verifyCrawlerHit,
  clearVerificationCache,
} from "@/lib/agent-analytics/verify-crawler-hits";
import type { RegistryMatch } from "@/lib/agent-analytics/bot-registry";

let client: ReturnType<typeof postgres>;

function makeRegistry(vendor: string): RegistryMatch {
  return {
    uaToken: "GPTBot",
    vendor,
    crawlerTier: "must_allow",
    defaultPurpose: "indexing",
    isAgentUa: false,
    aiPlatform: vendor,
    verificationPaths: ["cidr", "fcrdns", "asn"],
    cidrSourceUrl: "https://example.com/ranges.json",
    ptrDomainSuffix: ".example.com",
    expectedAsns: [12345],
  };
}

beforeAll(async () => {
  client = createClient();
  await assertDevDatabase(client);

  process.env.DATABASE_URL = process.env.DATABASE_URL ?? TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = process.env.SERVICE_DATABASE_URL ?? TEST_DB_URL;
});

beforeEach(() => {
  clearVerificationCache();
  mockReverse.mockClear();
  mockResolve4.mockClear();
  mockResolve6.mockClear();
  mockResolveTxt.mockClear();

  mockReverse.mockRejectedValue(new Error("NXDOMAIN"));
  mockResolveTxt.mockRejectedValue(new Error("NXDOMAIN"));
});

afterAll(async () => {
  await client.end();
});

// ── Group G: Verification cache (AA-10) ──

describe("G1: N hits from 3 IPs → exactly 3 DNS lookups", () => {
  it("300 hits across 3 IPs yields 3 reverse lookups, not 300", async () => {
    const ips = ["10.0.0.1", "10.0.0.2", "10.0.0.3"];
    const registry = makeRegistry("openai");

    for (let i = 0; i < 300; i++) {
      await verifyCrawlerHit(ips[i % 3], registry);
    }

    expect(mockReverse).toHaveBeenCalledTimes(3);
  });

  it("2 hits, same IP, 2 different vendors → 2 lookups (cache key includes vendor)", async () => {
    const ip = "10.0.0.99";

    await verifyCrawlerHit(ip, makeRegistry("openai"));
    await verifyCrawlerHit(ip, makeRegistry("anthropic"));

    expect(mockReverse).toHaveBeenCalledTimes(2);
  });
});
