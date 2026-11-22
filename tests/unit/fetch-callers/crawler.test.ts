/**
 * S00B part 3, the crawler (lib/crawler/index.ts: crawlSite's pages, robots.txt and sitemap, and fetchRobotsTxt) on
 * the guarded fetcher.
 *
 * Parity: on recorded public sites (tests/helpers/fetch-fixtures.ts) the crawl's output is byte for byte what it
 * was on the parent commit (the golden file was written there, before the crawler moved, with UPDATE_GOLDEN=1).
 *
 * Refusal: a sitemap or a redirect pointing at an internal address is refused through the crawl's own "couldn't
 * reach" path. The internal address here is a local test server on 127.0.0.1 that answers: before S00B the crawl
 * read it (internal content in the result); now it never connects.
 */
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { crawlSite, fetchRobotsTxt } from "@/lib/crawler";
import type { CrawlResult } from "@/lib/crawler/types";
import { fixtureFetch, golden } from "../../helpers/fetch-fixtures";
import {
  FIXTURE_DOMAINS,
  html,
  page,
  SITES,
  startInternalServer,
} from "../../helpers/fixture-sites";

const realFetch = globalThis.fetch.bind(globalThis);
const GOLDEN = resolve(__dirname, "__golden__/crawler.json");

/** The crawl's output, without the one field that is the time it ran. */
function stable(result: CrawlResult): Omit<CrawlResult, "crawledAt"> {
  const { crawledAt: _at, ...rest } = result;
  return rest;
}

let internal: Awaited<ReturnType<typeof startInternalServer>>;
let port: number;

beforeAll(async () => {
  internal = await startInternalServer();
  port = internal.port;
});

afterAll(async () => {
  await internal.close();
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("parity: recorded public sites crawl exactly as on the parent commit", () => {
  it("crawlSite (20 pages, 1 page, 0 pages) and fetchRobotsTxt on four sites", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(fixtureFetch(SITES));
    const outputs: Record<string, unknown> = {};
    for (const domain of FIXTURE_DOMAINS) {
      outputs[`${domain} crawl 20`] = stable(
        await crawlSite(domain, { maxPages: 20, timeoutMs: 15000 }),
      );
      outputs[`${domain} crawl 1`] = stable(
        await crawlSite(domain, { maxPages: 1, timeoutMs: 8000 }),
      );
      outputs[`${domain} crawl 0`] = stable(await crawlSite(domain, { maxPages: 0 }));
      outputs[`${domain} robots`] = await fetchRobotsTxt(domain);
    }
    const { expected, actual } = golden(GOLDEN, outputs);
    expect(actual).toBe(expected);
  });
});

describe("refusal: an internal address is never fetched, through the crawl's own error path", () => {
  it("a sitemap that robots.txt points at an internal address isn't read", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      fixtureFetch(
        {
          "https://fixture-sneaky.com.au/robots.txt": {
            headers: { "content-type": "text/plain" },
            body: `User-agent: *\nAllow: /\nSitemap: http://127.0.0.1:${port}/sitemap.xml\n`,
          },
          "https://fixture-sneaky.com.au/": html(page("Sneaky")),
        },
        { passThrough: realFetch },
      ),
    );
    const result = await crawlSite("fixture-sneaky.com.au", { maxPages: 1 });
    expect(result.robotsTxtFetch?.status).toBe("found");
    expect(result.sitemapXml).toBeNull();
    expect(result.sitemap).toEqual({
      url: `http://127.0.0.1:${port}/sitemap.xml`,
      status: "unreachable",
      httpStatus: null,
      reason: "no answer",
    });
  });

  it("a home page that redirects to an internal address: the crawl couldn't reach the site", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      fixtureFetch(
        {
          "https://fixture-redirect.com.au/robots.txt": { status: 404, body: "" },
          "https://fixture-redirect.com.au/": {
            redirect: 302,
            location: `http://127.0.0.1:${port}/admin`,
          },
        },
        { passThrough: realFetch },
      ),
    );
    const result = await crawlSite("fixture-redirect.com.au", { maxPages: 5 });
    expect(result.pages).toEqual([]);
    expect(result.homepage).toEqual({
      url: "https://fixture-redirect.com.au",
      reached: false,
      httpStatus: null,
    });
    expect(result.errors).toEqual(["Failed to fetch https://fixture-redirect.com.au (no answer)"]);
    expect(JSON.stringify(result)).not.toContain("Internal admin");
  });

  it("fetchRobotsTxt that redirects to an internal address: unreachable, nothing read", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      fixtureFetch(
        {
          "https://fixture-robots.com.au/robots.txt": {
            redirect: 301,
            location: `http://127.0.0.1:${port}/robots.txt`,
          },
        },
        { passThrough: realFetch },
      ),
    );
    expect(await fetchRobotsTxt("fixture-robots.com.au")).toEqual({
      status: "unreachable",
      httpStatus: null,
    });
  });

  it("a brand domain that is an internal address is refused before any request, and the refusal is logged", async () => {
    const warn = vi.mocked(console.warn);
    // Loopback, so the parent commit's unguarded crawl (the RED run) stays on this machine.
    const result = await crawlSite("127.0.0.1", { maxPages: 1 });
    expect(result.pages).toEqual([]);
    expect(result.robotsTxtFetch).toEqual({
      status: "unreachable",
      httpStatus: null,
      reason: "no answer",
    });
    const refusals = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((line) => line.includes("guarded_fetch_refused"))
      .map((line) => JSON.parse(line));
    expect(refusals.length).toBeGreaterThanOrEqual(3);
    expect(refusals[0]).toEqual({
      event: "guarded_fetch_refused",
      host: "127.0.0.1",
      reason: "blocked_address",
      detail: "loopback",
    });
  });
});
