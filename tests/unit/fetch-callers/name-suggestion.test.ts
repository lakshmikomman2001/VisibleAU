/**
 * S00B part 3, the name suggestion (GET /api/brands/name-suggestion, S00 part 4: the home page read through
 * crawlSite, one page, 8 s) on the guarded fetcher.
 *
 * Parity: on the recorded sites, the route answers as it did before S00B (golden written with UPDATE_GOLDEN=1 on
 * the code before the crawler moved). Refusal: a home page that redirects to an internal address is never read;
 * the suggestion falls back to the domain's own words (the route's existing "page couldn't be read" path), where
 * before S00B the internal page's site name was suggested.
 */
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureFetch, golden } from "../../helpers/fetch-fixtures";
import { FIXTURE_DOMAINS, SITES, startInternalServer } from "../../helpers/fixture-sites";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", organizationId: "org-1" })),
}));
vi.mock("@/lib/governance", () => ({ roleRefusal: vi.fn(async () => null) }));
vi.mock("@/lib/governance/pg-rate-limit", () => ({
  checkPostgresRateLimit: vi.fn(async () => ({
    allowed: true,
    remaining: 29,
    resetAt: new Date(0),
  })),
}));

const { GET } = await import("@/app/api/brands/name-suggestion/route");

const realFetch = globalThis.fetch.bind(globalThis);
const GOLDEN = resolve(__dirname, "__golden__/name-suggestion.json");

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
  vi.spyOn(console, "log").mockImplementation(() => {});
});

async function suggest(domain: string): Promise<{ status: number; body: unknown }> {
  const res = await GET(
    new Request(`http://localhost/api/brands/name-suggestion?domain=${domain}`),
  );
  return { status: res.status, body: await res.json() };
}

describe("parity: the suggestion from recorded sites is as before S00B", () => {
  it("four sites", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(fixtureFetch(SITES));
    const outputs: Record<string, unknown> = {};
    for (const domain of FIXTURE_DOMAINS) outputs[domain] = await suggest(domain);
    const { expected, actual } = golden(GOLDEN, outputs);
    expect(actual).toBe(expected);
  });
});

describe("refusal: an internal page never becomes the suggestion", () => {
  it("a home page that redirects to an internal address: the domain's own words, the page unread", async () => {
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
    const { status, body } = await suggest("fixture-redirect.com.au");
    expect(status).toBe(200);
    expect(body).toMatchObject({ source: "domain" });
    expect(JSON.stringify(body)).not.toContain("Internal");
    expect(internal.hits).toEqual([]);
  });
});
