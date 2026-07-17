/**
 * Section 1 — Backend Unit Tests (pure-logic classifiers)
 *
 * Break-proof discipline: every test here has been demonstrated to FAIL
 * when its guarded branch is flipped, then PASS when restored.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══════════════════════════════════════════════════════════════════
// Mocks — same boundary-mock pattern as existing tests
// ═══════════════════════════════════════════════════════════════════

vi.mock("dns", () => ({
  promises: {
    reverse: vi.fn(),
    resolve4: vi.fn(),
    resolve6: vi.fn(),
    resolveTxt: vi.fn(),
  },
}));

vi.mock("@/lib/agent-analytics/ip-ranges", () => ({
  checkCidrContainment: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  serviceDb: {},
}));

vi.mock("@/db/schema/ai-bot-registry", () => ({
  aiBotRegistry: { isActive: "is_active" },
}));

vi.mock("@/lib/agent-analytics/bot-registry", () => ({
  lookupByUserAgent: vi.fn(),
  clearRegistryCache: vi.fn(),
}));

import { promises as dns } from "dns";
import { checkCidrContainment } from "@/lib/agent-analytics/ip-ranges";
import {
  verifyCrawlerHit,
  clearVerificationCache,
} from "@/lib/agent-analytics/verify-crawler-hits";
import type { RegistryMatch } from "@/lib/agent-analytics/bot-registry";
import {
  classifyVisitPurpose,
  classifyCrawlerTier,
  isActiveAgentUserAgent,
} from "@/lib/retrieval/visit-classifier";
import { parseCrawlerLog } from "@/lib/agent-analytics/parse-crawler-log";
import { lookupByUserAgent } from "@/lib/agent-analytics/bot-registry";

const mockedDns = dns as unknown as {
  reverse: ReturnType<typeof vi.fn>;
  resolve4: ReturnType<typeof vi.fn>;
  resolve6: ReturnType<typeof vi.fn>;
  resolveTxt: ReturnType<typeof vi.fn>;
};
const mockedCidr = checkCidrContainment as ReturnType<typeof vi.fn>;
const mockedLookup = lookupByUserAgent as ReturnType<typeof vi.fn>;

function makeRegistry(overrides: Partial<RegistryMatch> = {}): RegistryMatch {
  return {
    uaToken: "GPTBot",
    vendor: "openai",
    crawlerTier: "must_allow",
    defaultPurpose: "indexing",
    isAgentUa: false,
    aiPlatform: "openai",
    verificationPaths: ["cidr", "fcrdns", "asn"],
    cidrSourceUrl: "https://openai.com/gptbot-ranges.json",
    ptrDomainSuffix: ".openai.com",
    expectedAsns: [394161],
    ...overrides,
  };
}

beforeEach(() => {
  clearVerificationCache();
  vi.resetAllMocks();
});

// ═══════════════════════════════════════════════════════════════════
// GROUP V: Verification decision table (§3.2) — break-proof tests
// ═══════════════════════════════════════════════════════════════════

describe("V1: CIDR hit → verified/cidr (§3.1(1))", () => {
  it("returns verified when source IP is in published CIDR range", async () => {
    mockedCidr.mockResolvedValue(true);

    const result = await verifyCrawlerHit("40.88.21.235", makeRegistry());

    expect(result.status).toBe("verified");
    expect(result.verifiedVia).toBe("cidr");
  });
});

describe("V2: FCrDNS all 4 steps pass → verified/fcrdns (§3.1(2))", () => {
  it("returns verified when PTR suffix matches and forward DNS resolves back", async () => {
    mockedCidr.mockResolvedValue(false);
    mockedDns.reverse.mockResolvedValue(["crawl-1.openai.com"]);
    mockedDns.resolve4.mockResolvedValue(["40.88.21.235"]);

    const result = await verifyCrawlerHit("40.88.21.235", makeRegistry());

    expect(result.status).toBe("verified");
    expect(result.verifiedVia).toBe("fcrdns");
  });
});

describe("V3: FCrDNS fail@step2 — PTR suffix wrong → spoofed (AA-05)", () => {
  it("returns spoofed when PTR hostname does not end with expected suffix", async () => {
    mockedCidr.mockResolvedValue(false);
    mockedDns.reverse.mockResolvedValue(["fake-bot.evil-host.com"]);

    const result = await verifyCrawlerHit("198.51.100.99", makeRegistry());

    expect(result.status).toBe("spoofed");
    expect(result.verifiedVia).toBe("fcrdns");
  });
});

describe("V4: FCrDNS fail@step4 — forward IP ≠ source → spoofed (AA-05)", () => {
  it("returns spoofed when forward DNS resolves to a different IP than source", async () => {
    mockedCidr.mockResolvedValue(false);
    // Step 1: reverse DNS returns a hostname
    mockedDns.reverse.mockResolvedValue(["crawl-1.openai.com"]);
    // Step 2: PTR suffix matches (".openai.com") ✓
    // Step 3: forward DNS resolves to a DIFFERENT IP
    mockedDns.resolve4.mockResolvedValue(["40.88.21.999"]);

    const result = await verifyCrawlerHit("198.51.100.50", makeRegistry());

    expect(result.status).toBe("spoofed");
    expect(result.verifiedVia).toBe("fcrdns");
  });
});

describe("V5: ASN-only match → unverified, NEVER verified (AA-09)", () => {
  it("ASN match alone returns unverified — ASN can only contradict, never confirm", async () => {
    const registry = makeRegistry({
      verificationPaths: ["asn"],
      cidrSourceUrl: null,
      ptrDomainSuffix: null,
    });
    // ASN lookup returns a matching ASN
    mockedDns.resolveTxt.mockResolvedValue([["394161 | 40.88.0.0/14 | US | arin |"]]);

    const result = await verifyCrawlerHit("40.88.21.235", registry);

    expect(result.status).toBe("unverified");
    expect(result.status).not.toBe("verified");
  });
});

describe("V6: ASN contradicts claimed vendor → spoofed", () => {
  it("returns spoofed when ASN does not match any expected ASN", async () => {
    const registry = makeRegistry({
      verificationPaths: ["asn"],
      cidrSourceUrl: null,
      ptrDomainSuffix: null,
      expectedAsns: [394161],
    });
    // ASN lookup returns a non-matching ASN (Cloudflare 13335, not OpenAI 394161)
    mockedDns.resolveTxt.mockResolvedValue([["13335 | 104.28.0.0/20 | US | arin |"]]);

    const result = await verifyCrawlerHit("104.28.1.5", registry);

    expect(result.status).toBe("spoofed");
    expect(result.verifiedVia).toBe("asn");
  });
});

describe("V7: Anthropic (no published CIDR) falls back to FCrDNS (AA-04)", () => {
  it("skips CIDR (no URL), proceeds to FCrDNS — does NOT short-circuit to unverified", async () => {
    const anthropicRegistry = makeRegistry({
      uaToken: "ClaudeBot",
      vendor: "anthropic",
      verificationPaths: ["cidr", "fcrdns"],
      cidrSourceUrl: null, // Anthropic has no published CIDR
      ptrDomainSuffix: ".anthropic.com",
      expectedAsns: null,
    });
    // CIDR path skipped (no cidrSourceUrl)
    // FCrDNS: reverse → valid PTR, forward → matches
    mockedDns.reverse.mockResolvedValue(["crawl-1.anthropic.com"]);
    mockedDns.resolve4.mockResolvedValue(["52.1.2.3"]);

    const result = await verifyCrawlerHit("52.1.2.3", anthropicRegistry);

    // Must reach FCrDNS and verify — NOT short-circuit to unverified
    expect(result.status).toBe("verified");
    expect(result.verifiedVia).toBe("fcrdns");
  });
});

describe("V8: No verification paths configured → unverified", () => {
  it("returns unverified when verificationPaths is empty", async () => {
    const registry = makeRegistry({
      verificationPaths: [],
    });

    const result = await verifyCrawlerHit("40.88.21.235", registry);

    expect(result.status).toBe("unverified");
    expect(result.verifiedVia).toBeNull();
  });
});

describe("V9: All paths inconclusive → unverified (§3.2 fallthrough)", () => {
  it("returns unverified when CIDR misses, FCrDNS is inconclusive, ASN is inconclusive", async () => {
    mockedCidr.mockResolvedValue(false);
    // FCrDNS: reverse throws → inconclusive
    mockedDns.reverse.mockRejectedValue(new Error("NXDOMAIN"));
    // ASN: lookup throws → inconclusive
    mockedDns.resolveTxt.mockRejectedValue(new Error("SERVFAIL"));

    const result = await verifyCrawlerHit("203.0.113.10", makeRegistry());

    expect(result.status).toBe("unverified");
    expect(result.status).not.toBe("spoofed");
  });
});

// ═══════════════════════════════════════════════════════════════════
// GROUP P: Purpose classifier (§3.3) — pure function, no mocks
// ═══════════════════════════════════════════════════════════════════

describe("P1: is_active_agent=true → retrieval (regardless of tier)", () => {
  it("active agent always classifies as retrieval", () => {
    expect(classifyVisitPurpose(true, "must_allow", 1)).toBe("retrieval");
    expect(classifyVisitPurpose(true, "data", 10)).toBe("retrieval");
    expect(classifyVisitPurpose(true, "emerging", 0)).toBe("retrieval");
  });
});

describe("P2: crawler_tier='data' (not active) → training", () => {
  it("data-tier non-active → training", () => {
    expect(classifyVisitPurpose(false, "data", 1)).toBe("training");
    expect(classifyVisitPurpose(false, "data", 100)).toBe("training");
  });
});

describe("P3: must_allow + pages > 3 → indexing", () => {
  it("must_allow with more than 3 pages → indexing", () => {
    expect(classifyVisitPurpose(false, "must_allow", 4)).toBe("indexing");
    expect(classifyVisitPurpose(false, "must_allow", 50)).toBe("indexing");
  });
});

describe("P4: must_allow + pages ≤ 3 → null", () => {
  it("must_allow with 3 or fewer pages → null", () => {
    expect(classifyVisitPurpose(false, "must_allow", 3)).toBeNull();
    expect(classifyVisitPurpose(false, "must_allow", 1)).toBeNull();
    expect(classifyVisitPurpose(false, "must_allow", 0)).toBeNull();
  });
});

describe("P5: Boundary — exactly 3 → null, exactly 4 → indexing", () => {
  it("the > 3 boundary is sharp: 3 is null, 4 is indexing", () => {
    const at3 = classifyVisitPurpose(false, "must_allow", 3);
    const at4 = classifyVisitPurpose(false, "must_allow", 4);

    expect(at3).toBeNull();
    expect(at4).toBe("indexing");
  });
});

describe("P6: Ordering — is_active_agent wins over tier", () => {
  it("active agent with data tier → retrieval (not training)", () => {
    // If tier were checked first, data would → training
    // But is_active_agent is checked first → retrieval
    const result = classifyVisitPurpose(true, "data", 1);
    expect(result).toBe("retrieval");
    expect(result).not.toBe("training");
  });
});

describe("P7: emerging tier, not active → null (fall-through)", () => {
  it("emerging non-active → null regardless of page count", () => {
    expect(classifyVisitPurpose(false, "emerging", 1)).toBeNull();
    expect(classifyVisitPurpose(false, "emerging", 100)).toBeNull();
  });
});

describe("P8: classifyCrawlerTier — hardcoded fallback sets", () => {
  it("maps known bots to correct tiers", () => {
    expect(classifyCrawlerTier("GPTBot")).toBe("must_allow");
    expect(classifyCrawlerTier("ClaudeBot")).toBe("must_allow");
    expect(classifyCrawlerTier("CCBot")).toBe("data");
    expect(classifyCrawlerTier("Bytespider")).toBe("data");
    expect(classifyCrawlerTier("SomeNewBot")).toBe("emerging");
  });
});

describe("P9: isActiveAgentUserAgent — active-agent UA patterns", () => {
  it("detects active-agent UAs", () => {
    expect(isActiveAgentUserAgent("ChatGPT-User")).toBe(true);
    expect(isActiveAgentUserAgent("Mozilla/5.0 (Claude-User)")).toBe(true);
    expect(isActiveAgentUserAgent("PerplexityBot/1.0")).toBe(true);
    expect(isActiveAgentUserAgent("Perplexity-User")).toBe(true);
  });

  it("rejects non-active UAs", () => {
    expect(isActiveAgentUserAgent("GPTBot/1.1")).toBe(false);
    expect(isActiveAgentUserAgent("ClaudeBot/1.0")).toBe(false);
    expect(isActiveAgentUserAgent("Mozilla/5.0 Chrome/120")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// GROUP L: Log parser — aggregate fixture + count assertions
// ═══════════════════════════════════════════════════════════════════

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

const BYTESPIDER_MATCH: RegistryMatch = {
  uaToken: "Bytespider",
  vendor: "bytedance",
  crawlerTier: "data",
  defaultPurpose: "training",
  isAgentUa: false,
  aiPlatform: null,
  verificationPaths: [],
  cidrSourceUrl: null,
  ptrDomainSuffix: null,
  expectedAsns: null,
};

// 13-line fixture:
//   8 bot lines with document paths → 8 hits
//   3 bot lines with static asset paths → 3 discardedStatic
//   2 human browser lines → 2 discardedHuman
const FIXTURE_13_LINES = [
  // 8 document-path bot hits
  '40.88.21.1 - - [17/Jul/2026:08:00:01 +1000] "GET /services HTTP/1.1" 200 5000 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
  '40.88.21.2 - - [17/Jul/2026:08:00:02 +1000] "GET /about HTTP/1.1" 200 3200 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
  '40.88.21.3 - - [17/Jul/2026:08:00:03 +1000] "GET /contact HTTP/1.1" 200 2100 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
  '40.88.21.4 - - [17/Jul/2026:08:00:04 +1000] "GET /pricing HTTP/1.1" 200 4400 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
  '52.1.2.3 - - [17/Jul/2026:08:01:00 +1000] "GET /faq HTTP/1.1" 200 2800 "-" "ClaudeBot/1.0"',
  '52.1.2.4 - - [17/Jul/2026:08:01:01 +1000] "GET /blog HTTP/1.1" 200 6100 "-" "ClaudeBot/1.0"',
  '110.2.3.4 - - [17/Jul/2026:08:02:00 +1000] "GET /products HTTP/1.1" 200 3300 "-" "Bytespider/1.0"',
  '198.51.100.1 - - [17/Jul/2026:08:03:00 +1000] "GET /home HTTP/1.1" 200 4000 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
  // 3 static asset lines (bot UA, but .css/.js/.png paths → discarded)
  '40.88.21.1 - - [17/Jul/2026:08:00:05 +1000] "GET /styles/main.css HTTP/1.1" 200 1200 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
  '40.88.21.1 - - [17/Jul/2026:08:00:06 +1000] "GET /js/app.js HTTP/1.1" 200 900 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
  '40.88.21.1 - - [17/Jul/2026:08:00:07 +1000] "GET /img/logo.png HTTP/1.1" 200 4400 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
  // 2 human browser lines (no registry match → discarded)
  '104.28.1.5 - - [17/Jul/2026:08:10:00 +1000] "GET /booking HTTP/1.1" 200 5321 "https://google.com" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"',
  '172.16.0.1 - - [17/Jul/2026:08:11:00 +1000] "GET /about HTTP/1.1" 200 3200 "https://bing.com" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1 (KHTML, like Gecko) Version/17.0 Safari/605.1"',
].join("\n");

describe("L1: 13-line fixture → exact counts (8 hits, 3 static, 2 human)", () => {
  beforeEach(() => {
    mockedLookup.mockImplementation(async (ua: string) => {
      if (ua.includes("GPTBot")) return GPTBOT_MATCH;
      if (ua.includes("ClaudeBot")) return CLAUDE_MATCH;
      if (ua.includes("Bytespider")) return BYTESPIDER_MATCH;
      return null;
    });
  });

  it("parses 13 lines into 8 hits, 3 discardedStatic, 2 discardedHuman", async () => {
    const result = await parseCrawlerLog(FIXTURE_13_LINES, "test.log");

    expect(result.totalLines).toBe(13);
    expect(result.hits).toHaveLength(8);
    expect(result.discardedStatic).toBe(3);
    expect(result.discardedHuman).toBe(2);
  });

  it("each hit has registryMatch populated from registry (not hardcoded)", async () => {
    const result = await parseCrawlerLog(FIXTURE_13_LINES, "test.log");

    const gptHits = result.hits.filter((h) => h.registryMatch.uaToken === "GPTBot");
    const claudeHits = result.hits.filter((h) => h.registryMatch.uaToken === "ClaudeBot");
    const byteHits = result.hits.filter((h) => h.registryMatch.uaToken === "Bytespider");

    expect(gptHits.length).toBe(5);
    expect(claudeHits.length).toBe(2);
    expect(byteHits.length).toBe(1);

    // Registry fields populated correctly (AA-C7)
    expect(gptHits[0].registryMatch.crawlerTier).toBe("must_allow");
    expect(gptHits[0].registryMatch.vendor).toBe("openai");
    expect(claudeHits[0].registryMatch.vendor).toBe("anthropic");
    expect(byteHits[0].registryMatch.crawlerTier).toBe("data");
    expect(byteHits[0].registryMatch.defaultPurpose).toBe("training");
  });
});

describe("L2: Human traffic discarded — browser UA not in registry", () => {
  beforeEach(() => {
    mockedLookup.mockImplementation(async (ua: string) => {
      if (ua.includes("GPTBot")) return GPTBOT_MATCH;
      return null;
    });
  });

  it("human browser line is discarded and counted in discardedHuman", async () => {
    const lines = [
      '40.88.21.1 - - [17/Jul/2026:08:00:01 +1000] "GET /page HTTP/1.1" 200 5000 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"',
      '104.28.1.5 - - [17/Jul/2026:08:10:00 +1000] "GET /page HTTP/1.1" 200 5321 "https://google.com" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"',
    ].join("\n");

    const result = await parseCrawlerLog(lines, "test.log");

    expect(result.hits).toHaveLength(1);
    expect(result.discardedHuman).toBe(1);
    expect(result.hits[0].registryMatch.uaToken).toBe("GPTBot");
  });
});

describe("L3: Static assets discarded — .css/.js/.png filtered", () => {
  beforeEach(() => {
    mockedLookup.mockImplementation(async () => GPTBOT_MATCH);
  });

  it("static asset paths are discarded and counted in discardedStatic", async () => {
    const lines = [
      '40.88.21.1 - - [17/Jul/2026:08:00:01 +1000] "GET /page HTTP/1.1" 200 5000 "-" "Mozilla/5.0 (compatible; GPTBot/1.1)"',
      '40.88.21.1 - - [17/Jul/2026:08:00:02 +1000] "GET /style.css HTTP/1.1" 200 1200 "-" "Mozilla/5.0 (compatible; GPTBot/1.1)"',
      '40.88.21.1 - - [17/Jul/2026:08:00:03 +1000] "GET /app.js HTTP/1.1" 200 900 "-" "Mozilla/5.0 (compatible; GPTBot/1.1)"',
      '40.88.21.1 - - [17/Jul/2026:08:00:04 +1000] "GET /logo.png HTTP/1.1" 200 4400 "-" "Mozilla/5.0 (compatible; GPTBot/1.1)"',
    ].join("\n");

    const result = await parseCrawlerLog(lines, "test.log");

    expect(result.hits).toHaveLength(1);
    expect(result.discardedStatic).toBe(3);
  });
});

describe("L4: Malformed line → skipped gracefully", () => {
  beforeEach(() => {
    mockedLookup.mockImplementation(async () => GPTBOT_MATCH);
  });

  it("garbage lines do not crash and do not become hits", async () => {
    const lines = [
      "this is not a valid log line at all",
      "another garbage line {{{",
      '40.88.21.1 - - [17/Jul/2026:08:00:01 +1000] "GET /page HTTP/1.1" 200 5000 "-" "Mozilla/5.0 (compatible; GPTBot/1.1)"',
    ].join("\n");

    const result = await parseCrawlerLog(lines, "test.log");

    expect(result.totalLines).toBe(3);
    expect(result.hits).toHaveLength(1);
    // Malformed lines are neither human nor static — they're just unparseable
    expect(result.discardedHuman).toBe(0);
    expect(result.discardedStatic).toBe(0);
  });
});

describe("L5: Bot lines matched — registryMatch populated from registry lookup", () => {
  beforeEach(() => {
    mockedLookup.mockImplementation(async (ua: string) => {
      if (ua.includes("GPTBot")) return GPTBOT_MATCH;
      return null;
    });
  });

  it("hit's registryMatch carries crawlerTier, defaultPurpose, isAgentUa from registry", async () => {
    const line =
      '40.88.21.1 - - [17/Jul/2026:08:00:01 +1000] "GET /page HTTP/1.1" 200 5000 "-" "Mozilla/5.0 (compatible; GPTBot/1.1)"';

    const result = await parseCrawlerLog(line, "test.log");

    expect(result.hits).toHaveLength(1);
    const hit = result.hits[0];
    expect(hit.registryMatch).toBeDefined();
    expect(hit.registryMatch.crawlerTier).toBe("must_allow");
    expect(hit.registryMatch.defaultPurpose).toBe("indexing");
    expect(hit.registryMatch.isAgentUa).toBe(false);
    expect(hit.registryMatch.vendor).toBe("openai");
  });
});
