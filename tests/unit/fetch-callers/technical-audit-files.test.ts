/**
 * S00B part 3, the technical audit's own file checks on the guarded fetcher:
 * - llms.txt and llms-full.txt (lib/technical-audit/orchestrate.ts, inventory F6, F7: fetch's own headers, 5 s);
 * - the AI files, /.well-known/ai.txt, /ai.txt and /ai/{summary,faq,service}.json (lib/ai-discovery/endpoints.ts,
 *   F8: fetch's own headers, 10 s);
 * - MCP, /mcp.json and /.well-known/mcp (lib/retrieval/mcp-checker.ts, F9: our user agent, 5 s).
 *
 * Parity: on recorded sites, orchestrateTechnicalAudit (scores and findings), checkAiDiscovery and
 * checkMcpEndpoint answer as on the parent commit (golden written there with UPDATE_GOLDEN=1). Refusal: a file that
 * redirects to an internal address is never read; each check answers "couldn't check (no answer)" through its
 * existing path, where before S00B it read the internal server's file as the site's own.
 */
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAiDiscovery } from "@/lib/ai-discovery/endpoints";
import { crawlSite } from "@/lib/crawler";
import { checkMcpEndpoint } from "@/lib/retrieval/mcp-checker";
import { orchestrateTechnicalAudit } from "@/lib/technical-audit/orchestrate";
import { type Fixture, fixtureFetch, golden } from "../../helpers/fetch-fixtures";
import { FIXTURE_DOMAINS, SITES, startInternalServer } from "../../helpers/fixture-sites";

const realFetch = globalThis.fetch.bind(globalThis);
const GOLDEN = resolve(__dirname, "__golden__/technical-audit-files.json");

const LONG_TEXT = `# Fixture Plumbing\n\n> Licensed plumbers in Sydney.\n\n${"- [Services](https://fixture-plumbing.com.au/services): what we do\n".repeat(4)}`;
const json = (value: unknown, status = 200): Fixture => ({
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(value),
});
const text = (body: string): Fixture => ({
  headers: { "content-type": "text/plain; charset=utf-8" },
  body,
});

const FILES: Record<string, Fixture> = {
  // Everything there, in its own type.
  "https://fixture-plumbing.com.au/llms.txt": text(LONG_TEXT),
  "https://fixture-plumbing.com.au/llms-full.txt": { status: 404, body: "" },
  "https://fixture-plumbing.com.au/.well-known/ai.txt": { status: 404, body: "" },
  "https://fixture-plumbing.com.au/ai.txt": text(
    `User-Agent: *\nAllow: /\n${"# policy line\n".repeat(10)}`,
  ),
  "https://fixture-plumbing.com.au/ai/summary.json": json({ summary: "x".repeat(150) }),
  "https://fixture-plumbing.com.au/ai/faq.json": { status: 404, body: "" },
  "https://fixture-plumbing.com.au/ai/service.json": { status: 500, body: "oops" },
  "https://fixture-plumbing.com.au/mcp.json": { status: 404, body: "" },
  "https://fixture-plumbing.com.au/.well-known/mcp": json({
    tools: [{ name: "book" }, { name: "quote" }],
  }),
  // A CDN refusing every file.
  "https://fixture-blocked.com.au/llms.txt": { status: 403, body: "" },
  "https://fixture-blocked.com.au/llms-full.txt": { status: 403, body: "" },
  "https://fixture-blocked.com.au/mcp.json": { status: 429, body: "" },
  "https://fixture-blocked.com.au/.well-known/mcp": { status: 403, body: "" },
  // The site's own HTML for every unknown path (soft 404s).
  "https://fixture-soft.com.au/llms.txt": {
    headers: { "content-type": "text/html" },
    body: "<html>not here</html>",
  },
  "https://fixture-soft.com.au/ai.txt": {
    headers: { "content-type": "text/html" },
    body: "<html>no</html>".repeat(20),
  },
  "https://fixture-soft.com.au/mcp.json": {
    headers: { "content-type": "text/html" },
    body: "<html>no</html>",
  },
  // Files behind redirects, an llms-full.txt, and a manifest that isn't JSON.
  "https://fixture-cdn.com.au/llms.txt": { redirect: 301, location: "/docs/llms.txt" },
  "https://fixture-cdn.com.au/docs/llms.txt": text(
    LONG_TEXT.replace(/Fixture Plumbing/g, "Fixture CDN"),
  ),
  "https://fixture-cdn.com.au/llms-full.txt": text(`${LONG_TEXT}\n${"Full text. ".repeat(80)}`),
  "https://fixture-cdn.com.au/.well-known/ai.txt": {
    redirect: 302,
    location: "https://www.fixture-cdn.com.au/ai.txt",
  },
  "https://www.fixture-cdn.com.au/ai.txt": text("short"),
  "https://fixture-cdn.com.au/mcp.json": {
    headers: { "content-type": "application/json" },
    body: "{not json",
  },
};

let internal: Awaited<ReturnType<typeof startInternalServer>>;

beforeAll(async () => {
  internal = await startInternalServer();
});

afterAll(async () => {
  await internal.close();
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("parity: the file checks on recorded sites are as on the parent commit", () => {
  it("orchestrateTechnicalAudit, checkAiDiscovery and checkMcpEndpoint on four sites", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(fixtureFetch({ ...SITES, ...FILES }));
    const outputs: Record<string, unknown> = {};
    for (const domain of FIXTURE_DOMAINS) {
      const crawl = await crawlSite(domain, { maxPages: 3, timeoutMs: 15000 });
      outputs[`${domain} technical audit`] = await orchestrateTechnicalAudit(domain, crawl, 5);
      outputs[`${domain} ai discovery`] = await checkAiDiscovery(domain);
      outputs[`${domain} mcp`] = await checkMcpEndpoint(domain);
    }
    const { expected, actual } = golden(GOLDEN, outputs);
    expect(actual).toBe(expected);
  });
});

describe("refusal: a file that redirects to an internal address is never read", () => {
  const toInternal = (path: string): Fixture => ({
    redirect: 302,
    location: `http://127.0.0.1:${internal.port}${path}`,
  });

  it("llms.txt and llms-full.txt: couldn't check, nothing scored from the internal file", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      fixtureFetch(
        {
          ...SITES,
          "https://fixture-plumbing.com.au/llms.txt": toInternal("/llms.txt"),
          "https://fixture-plumbing.com.au/llms-full.txt": toInternal("/llms-full.txt"),
        },
        { passThrough: realFetch },
      ),
    );
    const crawl = await crawlSite("fixture-plumbing.com.au", { maxPages: 1 });
    const result = await orchestrateTechnicalAudit("fixture-plumbing.com.au", crawl, 5);
    expect(JSON.stringify(result)).not.toContain("Internal");
    expect(JSON.stringify(result.findings)).toContain("no answer");
    expect(internal.hits).toEqual([]);
  });

  it("the AI files: couldn't check (no answer), never 'found'", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      fixtureFetch(
        {
          "https://fixture-plumbing.com.au/.well-known/ai.txt": toInternal("/ai.txt"),
          "https://fixture-plumbing.com.au/ai.txt": toInternal("/ai.txt"),
          "https://fixture-plumbing.com.au/ai/summary.json": toInternal("/ai/summary.json"),
          "https://fixture-plumbing.com.au/ai/faq.json": toInternal("/ai/faq.json"),
          "https://fixture-plumbing.com.au/ai/service.json": toInternal("/ai/service.json"),
        },
        { passThrough: realFetch },
      ),
    );
    const result = await checkAiDiscovery("fixture-plumbing.com.au");
    expect(result.findings).toMatchObject({
      aiTxtPresent: null,
      aiSummaryPresent: null,
      aiFaqPresent: null,
      aiServicePresent: null,
    });
    // Each one says why: the check's existing "couldn't check" reason for a request that got no answer.
    expect(result.findings.notChecked).toEqual({
      aiTxtPresent: "no answer",
      aiSummaryPresent: "no answer",
      aiFaqPresent: "no answer",
      aiServicePresent: "no answer",
    });
    expect(internal.hits).toEqual([]);
  });

  it("MCP: couldn't check (no answer), never present", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      fixtureFetch(
        {
          "https://fixture-plumbing.com.au/mcp.json": toInternal("/mcp.json"),
          "https://fixture-plumbing.com.au/.well-known/mcp": toInternal("/mcp"),
        },
        { passThrough: realFetch },
      ),
    );
    expect(await checkMcpEndpoint("fixture-plumbing.com.au")).toEqual({
      mcpEndpointPresent: null,
      mcpEndpointValid: null,
      mcpToolsCount: 0,
      mcpCheckFailure: "no answer",
    });
    expect(internal.hits).toEqual([]);
  });
});
