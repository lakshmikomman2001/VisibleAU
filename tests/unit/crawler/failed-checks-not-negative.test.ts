/**
 * Leftovers task, part 3 (17 Nov): a check whose request failed -- a timeout, no answer, a 403 or 429, a 5xx -- says
 * "Couldn't check (why)", never "not found", and no score counts it. Only a 404 or 410 means a file isn't there.
 *
 * Each external check, with fetch stubbed to the failure (lib/crawler/fetch-outcome.ts is the one rule): the AI
 * discovery files, llms.txt and llms-full.txt, robots.txt and the sitemap, the MCP manifest, the ABN lookup, YouTube's
 * latest upload, and a crawler's forward DNS.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({
  reverse: vi.fn(async () => ["crawl-1.googlebot.com"]),
  resolve4: vi.fn(async (): Promise<string[]> => {
    throw Object.assign(new Error("queryA ETIMEOUT"), { code: "ETIMEOUT" });
  }),
  resolve6: vi.fn(async (): Promise<string[]> => {
    throw Object.assign(new Error("queryAaaa ETIMEOUT"), { code: "ETIMEOUT" });
  }),
}));
vi.mock("dns", () => ({ promises: dns }));
vi.mock("@/db/client", () => ({ serviceDb: {} }));
import {
  combineOutcomes,
  couldntCheck,
  outcomeForError,
  outcomeForStatus,
} from "@/lib/crawler/fetch-outcome";

const timeout = () =>
  Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });

function stubFetch(answer: (url: string) => Response | Error) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const a = answer(url);
    if (a instanceof Error) throw a;
    return a;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the one rule (lib/crawler/fetch-outcome.ts)", () => {
  it("only 404 and 410 are absent; 401/403, 429, other 4xx and 5xx are couldn't check, with why", () => {
    expect(outcomeForStatus(404)).toEqual({ state: "absent" });
    expect(outcomeForStatus(410)).toEqual({ state: "absent" });
    expect(outcomeForStatus(403)).toEqual({ state: "unchecked", reason: "blocked, HTTP 403" });
    expect(outcomeForStatus(401)).toEqual({ state: "unchecked", reason: "blocked, HTTP 401" });
    expect(outcomeForStatus(429)).toEqual({ state: "unchecked", reason: "rate-limited, HTTP 429" });
    expect(outcomeForStatus(400)).toEqual({ state: "unchecked", reason: "HTTP 400" });
    expect(outcomeForStatus(503)).toEqual({ state: "unchecked", reason: "HTTP 503" });
  });

  it("a timeout or no answer is couldn't check", () => {
    expect(outcomeForError(timeout())).toEqual({ state: "unchecked", reason: "timed out" });
    expect(outcomeForError(new TypeError("fetch failed"))).toEqual({
      state: "unchecked",
      reason: "no answer",
    });
    expect(couldntCheck("timed out")).toBe("Couldn't check (timed out)");
  });

  it("two places for one file: found if either is, absent only if both are", () => {
    expect(combineOutcomes([{ state: "absent" }, { state: "found" }])).toEqual({ state: "found" });
    expect(combineOutcomes([{ state: "absent" }, { state: "absent" }])).toEqual({
      state: "absent",
    });
    expect(
      combineOutcomes([{ state: "absent" }, { state: "unchecked", reason: "timed out" }]),
    ).toEqual({
      state: "unchecked",
      reason: "timed out",
    });
  });
});

describe("AI discovery files (lib/ai-discovery/endpoints.ts)", () => {
  it("a timeout is couldn't check (null, with why), never a missing file, and no score from it", async () => {
    stubFetch(() => timeout());
    const { checkAiDiscovery } = await import("@/lib/ai-discovery/endpoints");
    const r = await checkAiDiscovery("example.com.au");
    expect(r.findings).toMatchObject({
      aiTxtPresent: null,
      aiSummaryPresent: null,
      aiFaqPresent: null,
      aiServicePresent: null,
    });
    expect(r.findings.notChecked).toEqual({
      aiTxtPresent: "timed out",
      aiSummaryPresent: "timed out",
      aiFaqPresent: "timed out",
      aiServicePresent: "timed out",
    });
    expect(r.measured).toBe(false);
  });

  it("404s are a measured absence (false), 0 points", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    const { checkAiDiscovery } = await import("@/lib/ai-discovery/endpoints");
    const r = await checkAiDiscovery("example.com.au");
    expect(r.findings).toMatchObject({ aiTxtPresent: false, aiSummaryPresent: false, score: 0 });
    expect(r.findings.notChecked).toEqual({});
    expect(r.measured).toBe(true);
  });

  it("a 403 on one file: that file couldn't be checked (blocked), the others still count", async () => {
    const body = "x".repeat(200);
    stubFetch((url) =>
      url.endsWith("/ai/faq.json")
        ? new Response("", { status: 403 })
        : url.endsWith(".json")
          ? new Response(JSON.stringify({ body }), {
              headers: { "content-type": "application/json" },
            })
          : new Response("", { status: 404 }),
    );
    const { checkAiDiscovery } = await import("@/lib/ai-discovery/endpoints");
    const r = await checkAiDiscovery("example.com.au");
    expect(r.findings.aiFaqPresent).toBeNull();
    expect(r.findings.notChecked).toEqual({ aiFaqPresent: "blocked, HTTP 403" });
    expect(r.findings.aiSummaryPresent).toBe(true);
    // 19 Nov: the /ai/ files earn nothing (lib/ai-discovery/endpoints.ts), so one that couldn't be checked leaves the
    // score measured; its row says why.
    expect(r.measured).toBe(true);
  });

  it("a 403 on ai.txt, the file that counts, leaves the score unmeasured", async () => {
    stubFetch((url) =>
      url.endsWith("ai.txt")
        ? new Response("", { status: 403 })
        : new Response("", { status: 404 }),
    );
    const { checkAiDiscovery } = await import("@/lib/ai-discovery/endpoints");
    const r = await checkAiDiscovery("example.com.au");
    expect(r.findings.aiTxtPresent).toBeNull();
    expect(r.measured).toBe(false);
  });
});

describe("the MCP manifest (lib/retrieval/mcp-checker.ts)", () => {
  it("a timeout at both places: null with why, never 'absent'", async () => {
    stubFetch(() => timeout());
    const { checkMcpEndpoint } = await import("@/lib/retrieval/mcp-checker");
    const r = await checkMcpEndpoint("example.com.au");
    expect(r.mcpEndpointPresent).toBeNull();
    expect(r.mcpCheckFailure).toBe("timed out");
  });

  it("404 at both places: absent (false)", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    const { checkMcpEndpoint } = await import("@/lib/retrieval/mcp-checker");
    expect((await checkMcpEndpoint("example.com.au")).mcpEndpointPresent).toBe(false);
  });
});

describe("the ABN lookup (lib/brand-entity/abn-lookup.ts)", () => {
  it("a lookup that didn't complete is check_failed -- not checked -- never 'not verified'", async () => {
    vi.stubEnv("ABN_LOOKUP_BYPASS", "");
    vi.stubEnv("ABN_LOOKUP_GUID", "test-guid");
    stubFetch(() => timeout());
    const { lookupAbn } = await import("@/lib/brand-entity/abn-lookup");
    const r = await lookupAbn("51 824 753 556");
    expect(r.abnStatus).toBe("check_failed");
    expect(r.abnVerified).toBe(false);
    const { abnWasChecked } = await import("@/lib/brand-entity/score");
    expect(abnWasChecked(r)).toBe(false);
    vi.unstubAllEnvs();
  });

  it("abnWasChecked: verified, or a status the register returned; never skipped, failed or no status", async () => {
    const { abnWasChecked } = await import("@/lib/brand-entity/score");
    expect(abnWasChecked({ abnVerified: true, abnStatus: "Active" })).toBe(true);
    expect(abnWasChecked({ abnVerified: false, abnStatus: "Cancelled" })).toBe(true);
    expect(abnWasChecked({ abnVerified: false, abnStatus: "check_skipped" })).toBe(false);
    expect(abnWasChecked({ abnVerified: false, abnStatus: "check_failed" })).toBe(false);
    expect(abnWasChecked({ abnVerified: false, abnStatus: null })).toBe(false);
  });
});

describe("robots.txt and the sitemap (lib/crawler/index.ts)", () => {
  it("a 403 on robots.txt and a timeout on the sitemap: couldn't check, with why -- never 'no robots.txt'", async () => {
    stubFetch((url) =>
      url.endsWith("/robots.txt")
        ? new Response("", { status: 403 })
        : url.endsWith("/sitemap.xml")
          ? timeout()
          : new Response("<html><head><title>Home</title></head><body>Hello</body></html>", {
              headers: { "content-type": "text/html" },
            }),
    );
    const { crawlSite } = await import("@/lib/crawler");
    const crawl = await crawlSite("example.com.au", { maxPages: 1, timeoutMs: 2000 });
    expect(crawl.robotsTxtFetch).toEqual({
      status: "unreachable",
      httpStatus: 403,
      reason: "blocked, HTTP 403",
    });
    expect(crawl.sitemap).toMatchObject({ status: "unreachable", reason: "timed out" });
  });

  it("a 404 is a missing file", async () => {
    stubFetch((url) =>
      url.endsWith(".txt") || url.endsWith(".xml")
        ? new Response("", { status: 404 })
        : new Response("<html><body>Hello</body></html>", {
            headers: { "content-type": "text/html" },
          }),
    );
    const { crawlSite } = await import("@/lib/crawler");
    const crawl = await crawlSite("example.com.au", { maxPages: 1, timeoutMs: 2000 });
    expect(crawl.robotsTxtFetch).toEqual({ status: "absent", httpStatus: 404 });
    expect(crawl.sitemap?.status).toBe("absent");
  });
});

describe("YouTube's latest upload (lib/trust/youtube-auditor.ts)", () => {
  it("an upload date that couldn't be checked is left out of the score, never 'No recent uploads'", async () => {
    const { scoreYoutubePresenceFromChannel } = await import("@/lib/trust/youtube-auditor");
    const unchecked = scoreYoutubePresenceFromChannel({
      channelExists: true,
      subscriberCount: 2000,
      videoCount: 40,
      daysSinceLastUpload: null,
      lastUploadChecked: false,
    });
    expect(unchecked.gaps.join(" ")).not.toContain("No recent uploads");
    expect(unchecked.gaps).toContain(
      "Couldn't check the channel's latest upload, so recency isn't part of this score.",
    );
    // Every measured part at its top: 100 of what was measured.
    expect(unchecked.presenceScore).toBe(100);
    const stale = scoreYoutubePresenceFromChannel({
      channelExists: true,
      subscriberCount: 2000,
      videoCount: 40,
      daysSinceLastUpload: null,
    });
    expect(stale.gaps.join(" ")).toContain("No recent uploads");
  });
});

describe("a crawler's forward DNS (lib/agent-analytics/verify-crawler-hits.ts)", () => {
  it("a reverse name that answered, then forward lookups that failed: unverified (couldn't check), never spoofed", async () => {
    const { verifyCrawlerHit, clearVerificationCache } = await import(
      "@/lib/agent-analytics/verify-crawler-hits"
    );
    clearVerificationCache();
    const r = await verifyCrawlerHit("66.249.66.1", {
      uaToken: "Googlebot",
      vendor: "google",
      crawlerTier: "must_allow",
      defaultPurpose: "indexing",
      isAgentUa: false,
      aiPlatform: null,
      verificationPaths: ["fcrdns"],
      cidrSourceUrl: null,
      ptrDomainSuffix: ".googlebot.com",
      expectedAsns: null,
    });
    expect(r.status).toBe("unverified");
  });
});

describe("llms.txt, llms-full.txt and the AI files in the technical audit (lib/technical-audit/orchestrate.ts)", () => {
  const REACHED = {
    domain: "example.com.au",
    pages: [
      {
        url: "https://example.com.au/",
        statusCode: 200,
        title: "Home",
        textContent: "Hello",
        wordCount: 1,
        excerpt: "Hello",
        byline: null,
        html: "<html><head><title>Home</title></head><body><h1>Hello</h1></body></html>",
        headers: {},
      },
    ],
    robotsTxt: "User-agent: *\nAllow: /",
    sitemapXml: null,
    crawledAt: new Date("2026-11-17T00:00:00Z"),
    errors: [],
    homepage: { url: "https://example.com.au/", reached: true, httpStatus: 200 },
    robotsTxtFetch: { status: "found" as const, httpStatus: 200 },
  };
  const LLMS = `# Example
> A plumber.

## Services
- [a](https://example.com.au/a)
## About
## Contact
${"x".repeat(1600)}`;

  it("llms.txt read but llms-full.txt timed out: the llms.txt score is unmeasured, never 3 points short", async () => {
    stubFetch((url) =>
      url.endsWith("/llms.txt")
        ? new Response(LLMS, { headers: { "content-type": "text/plain" } })
        : url.endsWith("/llms-full.txt")
          ? timeout()
          : new Response("", { status: 404 }),
    );
    const { orchestrateTechnicalAudit } = await import("@/lib/technical-audit/orchestrate");
    const r = await orchestrateTechnicalAudit("example.com.au", REACHED, 2);
    expect(r.findings.llmsTxt).toMatchObject({
      fetchStatus: "found",
      fullFetchStatus: "unreachable",
      fullFetchReason: "timed out",
    });
    expect(r.unmeasured).toContain("scoreLlmsTxt");
  });

  it("a 403 on llms.txt is couldn't check (blocked), never a missing file", async () => {
    stubFetch((url) =>
      url.endsWith("/llms.txt")
        ? new Response("", { status: 403 })
        : new Response("", { status: 404 }),
    );
    const { orchestrateTechnicalAudit } = await import("@/lib/technical-audit/orchestrate");
    const r = await orchestrateTechnicalAudit("example.com.au", REACHED, 2);
    expect(r.findings.llmsTxt).toMatchObject({
      fetchStatus: "unreachable",
      fetchReason: "blocked, HTTP 403",
    });
    expect(r.unmeasured).toContain("scoreLlmsTxt");
  });

  it("ai.txt timing out leaves the AI-discovery score unmeasured, an optional file doesn't; 404s everywhere measure 0", async () => {
    stubFetch((url) => (url.endsWith("ai.txt") ? timeout() : new Response("", { status: 404 })));
    const { orchestrateTechnicalAudit } = await import("@/lib/technical-audit/orchestrate");
    const failed = await orchestrateTechnicalAudit("example.com.au", REACHED, 2);
    expect(failed.unmeasured).toContain("scoreAiDiscovery");
    expect((failed.findings.aiDiscovery as { notChecked?: unknown }).notChecked).toEqual({
      aiTxtPresent: "timed out",
    });

    // 19 Nov: an optional /ai/ file that timed out is "couldn't check" on its own row, and the score stands.
    vi.restoreAllMocks();
    stubFetch((url) =>
      url.endsWith("/ai/faq.json") ? timeout() : new Response("", { status: 404 }),
    );
    const optional = await orchestrateTechnicalAudit("example.com.au", REACHED, 2);
    expect(optional.unmeasured).not.toContain("scoreAiDiscovery");
    expect((optional.findings.aiDiscovery as { notChecked?: unknown }).notChecked).toEqual({
      aiFaqPresent: "timed out",
    });

    vi.restoreAllMocks();
    stubFetch(() => new Response("", { status: 404 }));
    const absent = await orchestrateTechnicalAudit("example.com.au", REACHED, 2);
    expect(absent.unmeasured).not.toContain("scoreAiDiscovery");
    expect(absent.unmeasured).not.toContain("scoreLlmsTxt");
    expect(absent.dimensions.scoreAiDiscovery).toBe(0);
  });
});
