/**
 * S00B part 3, POST /api/crawl (app/api/crawl/route.ts: any domain a member with run_audit gives it, crawlSite up
 * to 20 pages) on the guarded fetcher. Its auth stays as it is: signed in, run_audit, no anonymous access (so no
 * rate limiter is added; docs/lld/fetch-inventory.md section 3).
 *
 * Parity: on the recorded sites, the route answers as it did before S00B (golden written with UPDATE_GOLDEN=1 on
 * the code before the crawler moved; the crawl time left out). Refusal: an internal domain, or a site that
 * redirects to one, is never fetched; the route answers with its existing shape (0 pages, the error).
 */
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureFetch, golden } from "../../helpers/fetch-fixtures";
import { FIXTURE_DOMAINS, SITES, startInternalServer } from "../../helpers/fixture-sites";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", organizationId: "org-1" })),
}));
vi.mock("@/lib/governance", () => ({ roleRefusal: vi.fn(async () => null) }));

const { POST } = await import("@/app/api/crawl/route");

const realFetch = globalThis.fetch.bind(globalThis);
const GOLDEN = resolve(__dirname, "__golden__/crawl-route.json");

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

async function crawl(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await POST(
    new Request("http://localhost/api/crawl", { method: "POST", body: JSON.stringify(body) }),
  );
  const json = (await res.json()) as Record<string, unknown>;
  const { crawledAt: _at, ...rest } = json;
  return { status: res.status, body: rest };
}

describe("parity: the route's answer for recorded sites is as before S00B", () => {
  it("four sites, 20 pages and 2", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(fixtureFetch(SITES));
    const outputs: Record<string, unknown> = {};
    for (const domain of FIXTURE_DOMAINS) {
      outputs[`${domain} 20`] = await crawl({ domain });
      outputs[`${domain} 2`] = await crawl({ domain, maxPages: 2 });
    }
    const { expected, actual } = golden(GOLDEN, outputs);
    expect(actual).toBe(expected);
  });
});

describe("refusal: the route never reaches an internal address", () => {
  it("a site that redirects to an internal address: 0 pages, the crawl's own error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      fixtureFetch(
        {
          "https://fixture-redirect.com.au/robots.txt": { status: 404, body: "" },
          "https://fixture-redirect.com.au/": {
            redirect: 302,
            location: `http://127.0.0.1:${internal.port}/admin`,
          },
        },
        { passThrough: realFetch },
      ),
    );
    const { status, body } = await crawl({ domain: "fixture-redirect.com.au", maxPages: 2 });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      pagesCount: 0,
      errors: ["Failed to fetch https://fixture-redirect.com.au (no answer)"],
    });
    expect(internal.hits).toEqual([]);
  });

  it("an internal domain given directly: refused before any connection, logged", async () => {
    const warn = vi.mocked(console.warn);
    const { body } = await crawl({ domain: `127.0.0.1:${internal.port}`, maxPages: 2 });
    expect(body).toMatchObject({ pagesCount: 0, robotsTxtPresent: false, sitemapPresent: false });
    expect(internal.hits).toEqual([]);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('"guarded_fetch_refused"'))).toBe(
      true,
    );
  });
});
