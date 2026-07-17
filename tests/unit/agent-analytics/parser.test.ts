import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGzip } from "zlib";
import { promisify } from "util";

const gzip = promisify(createGzip as unknown as (...args: unknown[]) => unknown) as unknown;

vi.mock("@/lib/agent-analytics/bot-registry", () => ({
  lookupByUserAgent: vi.fn(),
  clearRegistryCache: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  serviceDb: {},
}));

vi.mock("@/db/schema/ai-bot-registry", () => ({
  aiBotRegistry: { isActive: "is_active" },
}));

import { parseCrawlerLog } from "@/lib/agent-analytics/parse-crawler-log";
import { lookupByUserAgent } from "@/lib/agent-analytics/bot-registry";
import type { RegistryMatch } from "@/lib/agent-analytics/bot-registry";

const mockedLookup = lookupByUserAgent as ReturnType<typeof vi.fn>;

const GPTBOT_MATCH: RegistryMatch = {
  uaToken: "GPTBot",
  vendor: "openai",
  crawlerTier: "must_allow",
  defaultPurpose: "indexing",
  isAgentUa: false,
  aiPlatform: "openai",
  verificationPaths: ["cidr", "fcrdns"],
  cidrSourceUrl: "https://openai.com/gptbot-ranges.json",
  ptrDomainSuffix: ".openai.com",
  expectedAsns: [394161],
};

const CLAUDE_MATCH: RegistryMatch = {
  uaToken: "ClaudeBot",
  vendor: "anthropic",
  crawlerTier: "must_allow",
  defaultPurpose: "indexing",
  isAgentUa: false,
  aiPlatform: "anthropic",
  verificationPaths: ["fcrdns", "asn"],
  cidrSourceUrl: null,
  ptrDomainSuffix: ".anthropic.com",
  expectedAsns: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedLookup.mockImplementation(async (ua: string) => {
    if (ua.includes("GPTBot")) return GPTBOT_MATCH;
    if (ua.includes("ClaudeBot")) return CLAUDE_MATCH;
    return null;
  });
});

// ── Group C: Parser ──

describe("C1: CLF format extraction", () => {
  it("extracts IP, timestamp, path, status, bytes, UA from Combined Log Format", async () => {
    const line =
      '203.0.113.10 - - [16/Jul/2026:08:00:01 +1000] "GET /booking HTTP/1.1" 200 5321 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"';

    const result = await parseCrawlerLog(line, "test.log");

    expect(result.hits).toHaveLength(1);
    const hit = result.hits[0];
    expect(hit.sourceIp).toBe("203.0.113.10");
    expect(hit.path).toBe("/booking");
    expect(hit.statusCode).toBe(200);
    expect(hit.bytes).toBe(5321);
    expect(hit.userAgent).toContain("GPTBot");
    expect(hit.timestamp).toBeInstanceOf(Date);
    expect(hit.registryMatch.uaToken).toBe("GPTBot");
  });
});

describe("C2: non-AI UA discarded", () => {
  it("discards human browser UAs (not in registry) and counts them", async () => {
    const lines = [
      '203.0.113.10 - - [16/Jul/2026:08:00:01 +1000] "GET /booking HTTP/1.1" 200 5321 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
      '104.28.1.5 - - [16/Jul/2026:08:10:00 +1000] "GET /booking HTTP/1.1" 200 5321 "https://google.com" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"',
    ].join("\n");

    const result = await parseCrawlerLog(lines, "test.log");

    expect(result.hits).toHaveLength(1);
    expect(result.discardedHuman).toBe(1);
    expect(result.hits[0].registryMatch.uaToken).toBe("GPTBot");
  });
});

describe("C3: static assets discarded", () => {
  it("filters .css, .js, .png paths and counts them", async () => {
    const lines = [
      '203.0.113.10 - - [16/Jul/2026:08:00:01 +1000] "GET /booking HTTP/1.1" 200 5321 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
      '203.0.113.10 - - [16/Jul/2026:08:00:02 +1000] "GET /styles/main.css HTTP/1.1" 200 1200 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
      '203.0.113.10 - - [16/Jul/2026:08:00:03 +1000] "GET /js/app.js HTTP/1.1" 200 900 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
      '203.0.113.10 - - [16/Jul/2026:08:00:04 +1000] "GET /img/logo.png HTTP/1.1" 200 4400 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
    ].join("\n");

    const result = await parseCrawlerLog(lines, "test.log");

    expect(result.hits).toHaveLength(1);
    expect(result.discardedStatic).toBe(3);
    expect(result.hits[0].path).toBe("/booking");
  });
});

describe("C4: .gz decompression", () => {
  it("decompresses gzip buffer before parsing", async () => {
    const line =
      '203.0.113.10 - - [16/Jul/2026:08:00:01 +1000] "GET /booking HTTP/1.1" 200 5321 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"\n';

    const compressed = await new Promise<Buffer>((resolve, reject) => {
      const { createGzip } = require("zlib");
      const { Readable } = require("stream");
      const chunks: Buffer[] = [];
      const gz = createGzip();
      const readable = Readable.from(Buffer.from(line, "utf-8"));
      readable.pipe(gz);
      gz.on("data", (chunk: Buffer) => chunks.push(chunk));
      gz.on("end", () => resolve(Buffer.concat(chunks)));
      gz.on("error", reject);
    });

    const result = await parseCrawlerLog(compressed, "test.log.gz");

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].sourceIp).toBe("203.0.113.10");
  });
});

describe("C5: in-file dedup", () => {
  it("deduplicates identical lines within the same file by (ip, uaToken, path, timestamp)", async () => {
    const line =
      '203.0.113.10 - - [16/Jul/2026:08:00:01 +1000] "GET /booking HTTP/1.1" 200 5321 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"';
    const lines = [line, line, line].join("\n");

    const result = await parseCrawlerLog(lines, "test.log");

    expect(result.hits).toHaveLength(1);
  });
});
