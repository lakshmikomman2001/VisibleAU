/**
 * S00B part 4 (LLD 8.6.2, D-SEC1): no new way to fetch a customer's URL without the guarded fetcher.
 *
 * Server code under app/, lib/ and inngest/ may reach the network only through lib/fetch/guarded-fetch.ts, except
 * the named fixed-host clients below, each with the file, the host it calls and why, and how many references to
 * `fetch` it has (a call, or `fetch` passed as an injected default): a new fetch in one of these files fails too,
 * until someone has looked at it and raised the count here. docs/lld/fetch-inventory.md section 4 lists the same
 * clients. Client components ("use client") are the browser's own requests to the app's /api and aren't scanned.
 *
 * Also refused anywhere outside lib/fetch: undici, node:http(s), axios, got, node-fetch, cross-fetch.
 */
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourceFiles } from "../../helpers/source-files";

const ROOTS = ["app", "lib", "inngest"];
readSourcesBeforeAll(ROOTS);

/** Every server file allowed to call `fetch` itself, and the one host (or source) its URLs come from. */
const FIXED_HOST_CLIENTS: ReadonlyArray<{
  file: string;
  count: number;
  host: string;
  why: string;
}> = [
  {
    file: "inngest/functions/ga4-push.ts",
    count: 1,
    host: "www.google-analytics.com",
    why: "GA4 Measurement Protocol: Google's fixed host; the workspace supplies only its measurement id and secret",
  },
  {
    file: "lib/agent-analytics/ip-ranges.ts",
    count: 1,
    host: "aiBotRegistry",
    why: "AI crawlers' published IP ranges: URLs from the operator-seeded ai_bot_registry table, never a workspace's",
  },
  {
    file: "lib/auth/workspace-errors.ts",
    count: 1,
    host: "/api/auth/",
    why: "the browser's request to the app's own API: a relative path, which has no host on the server",
  },
  {
    file: "lib/brand-entity/abn-lookup.ts",
    // S01 part 11 (LLD 8.8.6): the ABN suggestion's name search and its AbnDetails confirmation share one more call.
    count: 2,
    host: "abr.business.gov.au",
    why: "the ABR web service (the ABN, or for the ABN suggestion the business's name, is a query parameter)",
  },
  {
    file: "lib/brand-entity/wikipedia-au.ts",
    count: 1,
    host: "en.wikipedia.org",
    why: "Wikipedia's search API (the brand name is a query parameter)",
  },
  {
    file: "lib/llm/perplexity-impl.ts",
    count: 1,
    host: "api.perplexity.ai",
    why: "an LLM provider's API",
  },
  {
    file: "lib/load/fetch-json.ts",
    count: 1,
    host: "the app's own /api",
    why: "a browser helper: every file that imports it is a client component (asserted below)",
  },
  {
    file: "lib/serp/dataforseo.ts",
    count: 1,
    host: "api.dataforseo.com",
    why: "DataForSEO's API: fetch is the injected default client",
  },
  {
    file: "lib/supabase.ts",
    count: 1,
    host: "SUPABASE_URL",
    why: "the Supabase storage client's own fetch, with a timeout: the project URL from the environment",
  },
  {
    file: "lib/trust/entity-checker.ts",
    count: 1,
    host: "abr.business.gov.au",
    why: "the ABR (the entity check's second path)",
  },
  {
    file: "lib/trust/youtube-channel-lookup.ts",
    count: 4,
    host: "www.googleapis.com",
    why: "YouTube Data API v3: search, channels (twice), playlistItems; a channel URL is parsed, never fetched",
  },
];

/** The callers moved onto the guarded fetcher in S00B part 3 (docs/lld/fetch-inventory.md section 6). */
const GUARDED_CALLERS = [
  "lib/crawler/index.ts",
  "lib/crawler/crawler-access.ts",
  "lib/technical-audit/orchestrate.ts",
  "lib/ai-discovery/endpoints.ts",
  "lib/retrieval/mcp-checker.ts",
  "lib/reports/agency-logo-loader.ts",
  "lib/webhooks/deliver.ts",
  "app/api/webhooks-config/[id]/test/route.ts",
];

/** Code with comments and the contents of quoted strings removed (so "fetch failed" isn't a reference). */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

const CALL = /(?<![\w.$])(?:(?:globalThis|window|self)\.)?fetch\s*\(/g;
/** `fetch` handed on as a value (a default parameter, `?? fetch`), never `typeof fetch`. */
const VALUE = /(?:=|\?\?|\|\||,|\(|:)\s*(?:(?:globalThis|window|self)\.)?fetch\s*(?=[,;)}\n])/g;
const HTTP_LIBRARIES =
  /(?:from\s+|require\(\s*|import\(\s*)["'](undici|node:https?|https?|axios|got|node-fetch|cross-fetch)["']/g;

const isClient = (text: string) => /^\s*["']use client["']/.test(text);
const outsideFetchDir = (path: string) => !path.startsWith("lib/fetch/");

function fetchReferences(text: string): number {
  const c = code(text);
  const values = [...c.matchAll(VALUE)].filter(
    (m) => !/typeof\s*$/.test(c.slice(Math.max(0, (m.index ?? 0) - 8), (m.index ?? 0) + 1)),
  );
  return [...c.matchAll(CALL)].length + values.length;
}

describe("server code fetches a customer's URL only through the guarded fetcher", () => {
  it("scans the shipped server code (it reads something)", () => {
    expect(sourceFiles(ROOTS).length).toBeGreaterThan(500);
  });

  it("every direct fetch outside lib/fetch is one of the named fixed-host clients, as many times as listed", () => {
    const found = sourceFiles(ROOTS)
      .filter((f) => /\.tsx?$/.test(f.path) && outsideFetchDir(f.path) && !isClient(f.text))
      .map((f) => ({ file: f.path, count: fetchReferences(f.text) }))
      .filter((f) => f.count > 0)
      .sort((a, b) => a.file.localeCompare(b.file));
    expect(found).toEqual(
      FIXED_HOST_CLIENTS.map(({ file, count }) => ({ file, count })).sort((a, b) =>
        a.file.localeCompare(b.file),
      ),
    );
  });

  it("each fixed-host client names its host (or source) in its own code", () => {
    const byPath = new Map(sourceFiles(ROOTS).map((f) => [f.path, f.text]));
    for (const client of FIXED_HOST_CLIENTS) {
      if (client.file === "lib/load/fetch-json.ts") continue;
      expect(byPath.get(client.file), client.file).toContain(client.host);
    }
  });

  it("the browser fetch helper is imported only by client components", () => {
    const importers = sourceFiles(["app", "components", "lib"]).filter((f) =>
      /from\s+["'](?:@\/lib\/load\/fetch-json|\.\/fetch-json|\.\.\/load\/fetch-json)["']/.test(
        f.text,
      ),
    );
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.filter((f) => !isClient(f.text)).map((f) => f.path)).toEqual([]);
  });

  it("no HTTP library outside lib/fetch: undici, node:http(s), axios, got, node-fetch, cross-fetch", () => {
    const found = sourceFiles(ROOTS)
      .filter((f) => outsideFetchDir(f.path))
      .flatMap((f) => [...f.text.matchAll(HTTP_LIBRARIES)].map((m) => `${f.path}: ${m[1]}`));
    expect(found).toEqual([]);
  });

  it("every caller moved in S00B fetches through guardedFetch, and none calls fetch itself", () => {
    const byPath = new Map(sourceFiles(ROOTS).map((f) => [f.path, f.text]));
    for (const file of GUARDED_CALLERS) {
      const text = byPath.get(file) ?? "";
      expect(code(text), file).toMatch(/guardedFetch\s*\(/);
      expect(fetchReferences(text), file).toBe(0);
    }
  });
});
