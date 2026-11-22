/**
 * S00B part 3, CDN Shield's probe (lib/crawler/crawler-access.ts: one GET of the home page as our checker, status
 * and headers only, redirects not followed, 5 s) on the guarded fetcher. Its robots.txt read is fetchRobotsTxt,
 * moved with the crawler (part 3a).
 *
 * Parity: on the recorded sites, checkCrawlerAccess answers as on the parent commit (golden written there with
 * UPDATE_GOLDEN=1). Refusal: an internal domain is refused before any connection; the check answers through its
 * existing "no answer" path (no probe status, no firewall named), and the refusal is logged.
 */
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkCrawlerAccess } from "@/lib/crawler/crawler-access";
import { type Fixture, fixtureFetch, golden } from "../../helpers/fetch-fixtures";
import { FIXTURE_DOMAINS, html, page, SITES } from "../../helpers/fixture-sites";

const GOLDEN = resolve(__dirname, "__golden__/cdn-shield.json");

const MORE: Record<string, Fixture> = {
  // A site behind Akamai that answers the checker with a 503, and one behind Sucuri with a 429.
  "https://fixture-akamai.com.au/robots.txt": {
    headers: { "content-type": "text/plain" },
    body: "User-agent: *\nDisallow:\n",
  },
  "https://fixture-akamai.com.au/": {
    status: 503,
    headers: { server: "AkamaiGHost", "x-akamai-request-id": "1" },
    body: "busy",
  },
  "https://fixture-sucuri.com.au/robots.txt": { status: 404, body: "" },
  "https://fixture-sucuri.com.au/": {
    status: 429,
    headers: { "x-sucuri-id": "9", server: "Sucuri/Cloudproxy" },
    body: "",
  },
  "https://fixture-open.com.au/robots.txt": {
    headers: { "content-type": "text/plain" },
    body: "User-agent: ClaudeBot\nDisallow: /\n",
  },
  "https://fixture-open.com.au/": html(page("Open"), { server: "nginx" }),
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("parity: the check on recorded sites is as on the parent commit", () => {
  it("seven sites: allowed, blocked by a CDN, redirected, rate-limited, robots blocking a crawler", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(fixtureFetch({ ...SITES, ...MORE }));
    const outputs: Record<string, unknown> = {};
    for (const domain of [
      ...FIXTURE_DOMAINS,
      "fixture-akamai.com.au",
      "fixture-sucuri.com.au",
      "fixture-open.com.au",
    ]) {
      outputs[domain] = await checkCrawlerAccess(domain);
    }
    const { expected, actual } = golden(GOLDEN, outputs);
    expect(actual).toBe(expected);
  });

  it("the probe doesn't follow a redirect: the 302 is the answer", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(fixtureFetch(SITES));
    expect((await checkCrawlerAccess("fixture-cdn.com.au")).probeStatus).toBe(302);
  });
});

describe("refusal: an internal domain is never probed", () => {
  it("refused before any connection: no probe status, nothing named; the refusal logged", async () => {
    const warn = vi.mocked(console.warn);
    // Loopback, so the parent commit's unguarded probe (the RED run) stays on this machine.
    const check = await checkCrawlerAccess("127.0.0.1");
    expect(check).toMatchObject({
      robotsTxt: "unreachable",
      robots: null,
      probeStatus: null,
      detectedFirewall: "None",
      checkerRefused: false,
    });
    const refusals = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((line) => line.includes('"guarded_fetch_refused"'))
      .map((line) => JSON.parse(line));
    // One for robots.txt (fetchRobotsTxt), one for the probe itself.
    expect(refusals).toEqual([
      {
        event: "guarded_fetch_refused",
        host: "127.0.0.1",
        reason: "blocked_address",
        detail: "loopback",
      },
      {
        event: "guarded_fetch_refused",
        host: "127.0.0.1",
        reason: "blocked_address",
        detail: "loopback",
      },
    ]);
  });
});
