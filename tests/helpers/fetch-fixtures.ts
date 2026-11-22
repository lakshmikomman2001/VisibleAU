/**
 * S00B part 3: recorded websites for the caller parity tests (tests/unit/fetch-callers/). `fixtureFetch` stands in
 * for global `fetch` the way `fetch` behaves: "follow" (the default) follows a fixture's redirect itself and
 * answers with the final response (url, redirected); "manual" answers with the 3xx; "error" fails. So the same
 * fixtures drive a caller before S00B (which called `fetch` and let it follow) and after (which calls the guarded
 * fetcher, which calls `fetch` with "manual" and follows each hop itself).
 *
 * A URL on a fixture host with no fixture is a 404. A URL on any other host goes to `passThrough` (the real
 * `fetch`, to reach a local test server standing in for an internal address), or fails as an unknown host does.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type Fixture =
  | { status?: number; headers?: Record<string, string>; body?: string }
  | { redirect: 301 | 302 | 303 | 307 | 308; location: string };

const NULL_BODY = new Set([101, 204, 205, 304]);

function answer(
  status: number,
  headers: Record<string, string>,
  body: string,
  href: string,
  redirected: boolean,
): Response {
  const res = new Response(NULL_BODY.has(status) ? null : body, { status, headers });
  Object.defineProperty(res, "url", { value: href });
  Object.defineProperty(res, "redirected", { value: redirected });
  return res;
}

function hrefOf(input: RequestInfo | URL): string {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    .href;
}

export function fixtureFetch(
  fixtures: Record<string, Fixture>,
  options: { passThrough?: typeof fetch } = {},
): typeof fetch {
  const table = new Map(Object.entries(fixtures).map(([url, f]) => [new URL(url).href, f]));
  const hosts = new Set([...table.keys()].map((url) => new URL(url).host));
  return async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    let href = hrefOf(input);
    let redirected = false;
    for (let hop = 0; hop <= 20; hop++) {
      const fixture = table.get(href);
      if (!fixture) {
        if (hosts.has(new URL(href).host)) return answer(404, {}, "not found", href, redirected);
        if (options.passThrough) return options.passThrough(href, init);
        throw new TypeError("fetch failed", { cause: new Error(`getaddrinfo ENOTFOUND ${href}`) });
      }
      if ("redirect" in fixture) {
        if (init.redirect === "manual")
          return answer(fixture.redirect, { location: fixture.location }, "", href, redirected);
        if (init.redirect === "error") throw new TypeError("fetch failed");
        href = new URL(fixture.location, href).href;
        redirected = true;
        continue;
      }
      return answer(
        fixture.status ?? 200,
        fixture.headers ?? {},
        fixture.body ?? "",
        href,
        redirected,
      );
    }
    throw new TypeError("fetch failed", { cause: new Error("redirect count exceeded") });
  };
}

/**
 * A caller's outputs as the golden file holds them: written when UPDATE_GOLDEN=1 (on the parent commit, before
 * the caller moves onto the guarded fetcher), else read back for a byte-for-byte comparison.
 */
export function golden(file: string, outputs: unknown): { expected: string; actual: string } {
  const actual = `${JSON.stringify(outputs, null, 2)}\n`;
  if (process.env.UPDATE_GOLDEN === "1") {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, actual);
  }
  return { expected: readFileSync(file, "utf8").replace(/\r\n/g, "\n"), actual };
}
