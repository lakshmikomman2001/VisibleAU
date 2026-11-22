/**
 * S00B part 2 (LLD 8.6.2, D-SEC1): the guarded fetcher refuses every address that isn't a public website, for
 * every caller, and otherwise answers exactly as `fetch` does.
 *
 * The network is the test transport (tests/helpers/guarded-fetch-test-transport.ts, swapped in with vi.mock):
 * fixture host names resolve to public-looking addresses, which it connects to a local server. Production code
 * can't do this (guarded-fetch-injection-guard.test.ts).
 */
import { once } from "node:events";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testNetwork } from "../../helpers/guarded-fetch-test-transport";

vi.mock("@/lib/fetch/transport", () => import("../../helpers/guarded-fetch-test-transport"));

const { guardedFetch, GuardedFetchError, HARD_MAX_BYTES, HARD_TIMEOUT_MS } = await import(
  "@/lib/fetch/guarded-fetch"
);
const { outcomeForError } = await import("@/lib/crawler/fetch-outcome");

/** example.com's own addresses: public, never in a blocked range. */
const PUBLIC_V4 = "93.184.215.14";
const PUBLIC_V4_B = "93.184.215.15";
const PUBLIC_V6 = "2606:2800:21f:cb07:6820:80da:af6b:8b2c";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
const routes = new Map<string, Handler>();
const seen: Array<{ host: string; path: string; method: string; headers: Record<string, string> }> =
  [];
let server: http.Server;
let port: number;

function route(hostAndPath: string, handler: Handler): void {
  routes.set(hostAndPath, handler);
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    // One connection per request: the pool never reuses a socket across tests, so lookups and connections count.
    res.setHeader("connection", "close");
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    const path = req.url ?? "/";
    seen.push({
      host: req.headers.host ?? "",
      path,
      method: req.method ?? "",
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.join(", ") : (v ?? ""),
        ]),
      ),
    });
    const handler = routes.get(`${host}${path}`) ?? routes.get(`*${path}`);
    if (!handler) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    handler(req, res);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  testNetwork.reset();
  routes.clear();
  seen.length = 0;
  testNetwork.host("site.test", [PUBLIC_V4]);
  testNetwork.servers.set(PUBLIC_V4, port);
  testNetwork.servers.set(PUBLIC_V4_B, port);
  testNetwork.servers.set(PUBLIC_V6, port);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function html(body: string, headers: Record<string, string> = {}): Handler {
  return (_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...headers });
    res.end(body);
  };
}

function redirect(status: number, location: string): Handler {
  return (_req, res) => {
    res.writeHead(status, { location });
    res.end();
  };
}

async function refusal(promise: Promise<unknown>): Promise<InstanceType<typeof GuardedFetchError>> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(GuardedFetchError);
    return err as InstanceType<typeof GuardedFetchError>;
  }
  throw new Error("expected a refusal, got an answer");
}

describe("a public website answers as with fetch", () => {
  it("http and https fixtures: status, headers, body, url, the original Host header", async () => {
    route("site.test/", html("<title>Site</title>", { "x-thing": "1" }));
    const res = await guardedFetch("https://site.test/");
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.headers.get("x-thing")).toBe("1");
    expect(await res.text()).toBe("<title>Site</title>");
    expect(res.url).toBe("https://site.test/");
    expect(res.redirected).toBe(false);
    expect(seen[0].host).toBe("site.test");
    const plain = await guardedFetch("http://site.test/");
    expect(await plain.text()).toBe("<title>Site</title>");
    // The connection went to the checked address, with the name as TLS server name.
    expect(testNetwork.connects[0]).toMatchObject({
      hostname: "site.test",
      port: 443,
      addresses: [{ address: PUBLIC_V4, family: 4 }],
    });
  });

  it("an IPv6 answer and a public IP literal are fetched", async () => {
    testNetwork.host("v6.test", [PUBLIC_V6]);
    route("v6.test/", html("six"));
    expect(await (await guardedFetch("http://v6.test/")).text()).toBe("six");
    route(`${PUBLIC_V4}/`, html("literal"));
    expect(await (await guardedFetch(`http://${PUBLIC_V4}/`)).text()).toBe("literal");
    expect(testNetwork.lookups).toEqual(["v6.test"]);
    expect(testNetwork.connects[1]).toMatchObject({
      hostname: PUBLIC_V4,
      addresses: [{ address: PUBLIC_V4, family: 4 }],
    });
  });

  it("ports 80 and 443 written out are allowed", async () => {
    route("site.test/", html("ok"));
    expect((await guardedFetch("http://site.test:80/")).status).toBe(200);
    expect((await guardedFetch("https://site.test:443/")).status).toBe(200);
    expect(seen.map((s) => s.host)).toEqual(["site.test", "site.test"]);
  });
});

describe("schemes, ports and credentials", () => {
  for (const url of [
    "ftp://site.test/",
    "file:///etc/passwd",
    "data:text/plain,hi",
    "gopher://site.test/",
  ]) {
    it(`${url.split(":")[0]}: is refused`, async () => {
      expect((await refusal(guardedFetch(url))).code).toBe("blocked_scheme");
      expect(testNetwork.connects).toHaveLength(0);
    });
  }

  for (const url of [
    "http://site.test:8080/",
    "https://site.test:8443/",
    "http://site.test:22/",
    "https://site.test:3000/",
  ]) {
    it(`port ${new URL(url).port}: is refused`, async () => {
      expect((await refusal(guardedFetch(url))).code).toBe("blocked_port");
      expect(testNetwork.lookups).toHaveLength(0);
    });
  }

  it("a user name or password in the URL is refused", async () => {
    expect((await refusal(guardedFetch("http://user:pass@site.test/"))).code).toBe(
      "blocked_credentials",
    );
    expect((await refusal(guardedFetch("https://user@site.test/"))).code).toBe(
      "blocked_credentials",
    );
  });

  it("allowHttp: false refuses plain http, given or redirected to", async () => {
    expect((await refusal(guardedFetch("http://site.test/", { allowHttp: false }))).code).toBe(
      "blocked_scheme",
    );
    route("site.test/down", redirect(301, "http://site.test/"));
    expect((await refusal(guardedFetch("https://site.test/down", { allowHttp: false }))).code).toBe(
      "blocked_scheme",
    );
  });
});

describe("addresses that aren't public websites, as IP literals in any notation", () => {
  const literals: Array<[string, string]> = [
    ["http://127.0.0.1/", "loopback"],
    ["http://2130706433/", "loopback"],
    ["http://0x7f000001/", "loopback"],
    ["http://0x7f.0.0.1/", "loopback"],
    ["http://0177.0.0.1/", "loopback"],
    ["http://127.1/", "loopback"],
    ["http://017700000001/", "loopback"],
    ["http://0/", "unspecified"],
    ["http://0.0.0.0/", "unspecified"],
    ["http://[::]/", "unspecified"],
    ["http://[::1]/", "loopback"],
    ["http://[::ffff:127.0.0.1]/", "ipv4_mapped"],
    ["http://[::ffff:7f00:1]/", "ipv4_mapped"],
    ["http://[::ffff:93.184.215.14]/", "ipv4_mapped"],
    ["http://[::127.0.0.1]/", "ipv4_compatible"],
    ["http://169.254.169.254/latest/meta-data/", "metadata"],
    ["http://0xa9fea9fe/", "metadata"],
    ["http://[fd00:ec2::254]/", "metadata"],
    ["http://100.100.100.200/", "metadata"],
    ["http://169.254.1.1/", "link_local"],
    ["http://[fe80::1]/", "link_local"],
    ["http://10.0.0.1/", "private"],
    ["http://012.1/", "private"],
    ["http://172.16.0.1/", "private"],
    ["http://172.31.255.255/", "private"],
    ["http://192.168.1.1/", "private"],
    ["http://100.64.0.1/", "cgnat"],
    ["http://100.127.255.254/", "cgnat"],
    ["http://224.0.0.1/", "multicast"],
    ["http://[ff02::1]/", "multicast"],
    ["http://255.255.255.255/", "broadcast"],
    ["http://240.0.0.1/", "reserved"],
    ["http://192.0.0.8/", "reserved"],
    ["http://192.0.2.1/", "documentation"],
    ["http://198.18.0.1/", "benchmarking"],
    ["http://[fc00::1]/", "unique_local"],
    ["http://[fd12:3456::1]/", "unique_local"],
    ["http://[fec0::1]/", "site_local"],
    ["http://[64:ff9b::a00:1]/", "nat64"],
    ["http://[2002:7f00:1::]/", "6to4"],
    ["http://[2001::1]/", "teredo"],
    ["http://[2001:db8::1]/", "documentation"],
  ];
  for (const [url, reason] of literals) {
    it(`${url} is refused (${reason}) without a lookup or a connection`, async () => {
      const err = await refusal(guardedFetch(url));
      expect(err.code).toBe("blocked_address");
      expect(err.detail).toBe(reason);
      expect(testNetwork.lookups).toHaveLength(0);
      expect(testNetwork.connects).toHaveLength(0);
    });
  }

  it("public literals next to those ranges are allowed (the edges are exact)", async () => {
    for (const ip of ["172.32.0.1", "100.128.0.1", "11.0.0.1", "192.169.0.1", "223.255.255.254"]) {
      testNetwork.servers.set(ip, port);
      route(`${ip}/`, html(ip));
      expect(await (await guardedFetch(`http://${ip}/`)).text()).toBe(ip);
    }
    testNetwork.servers.set("2606:4700::1", port);
    route("[2606:4700::1]/", html("v6"));
    expect(await (await guardedFetch("http://[2606:4700::1]/")).text()).toBe("v6");
    testNetwork.servers.set("64:ff9b::5db8:d70e", port);
    route("[64:ff9b::5db8:d70e]/", html("nat64 public"));
    expect(await (await guardedFetch("http://[64:ff9b::5db8:d70e]/")).text()).toBe("nat64 public");
  });
});

describe("host names", () => {
  for (const name of [
    "localhost",
    "api.localhost",
    "metadata.google.internal",
    "metadata.goog",
    "db.internal",
    "printer.local",
    "router.home.arpa",
  ]) {
    it(`${name} is refused before any lookup`, async () => {
      expect((await refusal(guardedFetch(`http://${name}/`))).code).toBe("blocked_address");
      expect(testNetwork.lookups).toHaveLength(0);
    });
  }

  it("a name that resolves to a private address is refused, and nothing connects", async () => {
    testNetwork.host("intranet.test", ["10.1.2.3"]);
    const err = await refusal(guardedFetch("http://intranet.test/"));
    expect(err).toMatchObject({ code: "blocked_address", detail: "private" });
    expect(testNetwork.connects).toHaveLength(0);
  });

  it("a name with one public and one private answer is refused (every address is checked)", async () => {
    testNetwork.host("mixed.test", [PUBLIC_V4, "127.0.0.1"]);
    expect((await refusal(guardedFetch("http://mixed.test/"))).code).toBe("blocked_address");
    testNetwork.host("mixed6.test", [PUBLIC_V4, "::1"]);
    expect((await refusal(guardedFetch("http://mixed6.test/"))).code).toBe("blocked_address");
    expect(testNetwork.connects).toHaveLength(0);
  });

  it("a name that doesn't resolve is a network failure, as with fetch", async () => {
    const err = await guardedFetch("http://nowhere.test/").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect((err as TypeError).message).toBe("fetch failed");
    expect(outcomeForError(err)).toEqual({ state: "unchecked", reason: "no answer" });
  });
});

describe("DNS rebinding: the checked address is the one connected to", () => {
  it("a name that answers public, then private: one lookup, and the connection goes to the public answer", async () => {
    testNetwork.host("rebind.test", [PUBLIC_V4], ["127.0.0.1"]);
    route("rebind.test/", html("first answer"));
    const res = await guardedFetch("http://rebind.test/");
    expect(await res.text()).toBe("first answer");
    expect(testNetwork.lookups).toEqual(["rebind.test"]);
    expect(testNetwork.connects).toHaveLength(1);
    expect(testNetwork.connects[0].addresses).toEqual([{ address: PUBLIC_V4, family: 4 }]);
    // The second answer is the private one: a fetch that looked it up would have been refused.
    expect((await refusal(guardedFetch("http://rebind.test/"))).code).toBe("blocked_address");
    expect(testNetwork.connects).toHaveLength(1);
  });

  it("each redirect hop is looked up once and checked: a hop that rebinds to private is refused", async () => {
    testNetwork.host("hop.test", ["192.168.0.10"]);
    route("site.test/go", redirect(302, "http://hop.test/"));
    expect((await refusal(guardedFetch("http://site.test/go"))).detail).toBe("private");
    expect(testNetwork.lookups).toEqual(["site.test", "hop.test"]);
    expect(testNetwork.connects).toHaveLength(1);
  });
});

describe("redirects", () => {
  it("a redirect to a private address, a metadata address or a blocked port is refused", async () => {
    route("site.test/a", redirect(302, "http://127.0.0.1/admin"));
    route("site.test/b", redirect(301, "http://169.254.169.254/latest/meta-data/"));
    route("site.test/c", redirect(307, "http://site.test:8080/"));
    route("site.test/d", redirect(308, "file:///etc/passwd"));
    expect((await refusal(guardedFetch("http://site.test/a"))).detail).toBe("loopback");
    expect((await refusal(guardedFetch("http://site.test/b"))).detail).toBe("metadata");
    expect((await refusal(guardedFetch("http://site.test/c"))).code).toBe("blocked_port");
    expect((await refusal(guardedFetch("http://site.test/d"))).code).toBe("blocked_scheme");
  });

  it("followed like fetch: relative Location, the final url, redirected, the final status", async () => {
    route("site.test/old", redirect(301, "/new"));
    route("site.test/new", html("moved"));
    const res = await guardedFetch("http://site.test/old");
    expect(await res.text()).toBe("moved");
    expect(res.url).toBe("http://site.test/new");
    expect(res.redirected).toBe(true);
  });

  it("too many redirects: refused after the limit (default 20, as fetch)", async () => {
    route("site.test/loop", redirect(302, "/loop"));
    expect((await refusal(guardedFetch("http://site.test/loop", { maxRedirects: 3 }))).code).toBe(
      "too_many_redirects",
    );
    expect(seen).toHaveLength(4);
    seen.length = 0;
    expect((await refusal(guardedFetch("http://site.test/loop"))).code).toBe("too_many_redirects");
    expect(seen).toHaveLength(21);
  });

  it("manual returns the 3xx itself; error fails as fetch does", async () => {
    route("site.test/r", redirect(302, "/elsewhere"));
    const manual = await guardedFetch("http://site.test/r", { redirect: "manual" });
    expect(manual.status).toBe(302);
    expect(manual.headers.get("location")).toBe("/elsewhere");
    const err = await guardedFetch("http://site.test/r", { redirect: "error" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(TypeError);
  });

  it("a POST after a 303 becomes a GET without its body; after a 307 it stays a POST", async () => {
    route("site.test/hook303", redirect(303, "/landed"));
    route("site.test/hook307", redirect(307, "/landed"));
    route("site.test/landed", (req, res) => {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(`${req.method} ${body}`);
      });
    });
    const opts = {
      method: "POST" as const,
      body: '{"a":1}',
      headers: { "Content-Type": "application/json" },
    };
    expect(await (await guardedFetch("http://site.test/hook303", opts)).text()).toBe("GET ");
    expect(await (await guardedFetch("http://site.test/hook307", opts)).text()).toBe(
      'POST {"a":1}',
    );
  });
});

describe("size, content type, time", () => {
  it("a body past maxBytes is refused while it's read; a declared length past it before", async () => {
    route("site.test/big", (_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.write("x".repeat(600));
      res.end("y".repeat(600));
    });
    const res = await guardedFetch("http://site.test/big", { maxBytes: 1000 });
    const err = await res.text().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GuardedFetchError);
    expect((err as InstanceType<typeof GuardedFetchError>).code).toBe("too_large");
    route("site.test/declared", (_req, res) => {
      res.writeHead(200, { "content-type": "text/html", "content-length": "5000" });
      res.end("z".repeat(5000));
    });
    expect(
      (await refusal(guardedFetch("http://site.test/declared", { maxBytes: 1000 }))).code,
    ).toBe("too_large");
    expect(
      await (await guardedFetch("http://site.test/declared", { maxBytes: 5000 })).text(),
    ).toHaveLength(5000);
  });

  it("the limit counts decoded bytes (a small gzip that inflates past it is refused)", async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(200_000, 0x61));
    route("site.test/bomb", (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
      res.end(bomb);
    });
    const res = await guardedFetch("http://site.test/bomb", { maxBytes: 100_000 });
    const err = await res.text().catch((e: unknown) => e);
    expect((err as InstanceType<typeof GuardedFetchError>).code).toBe("too_large");
  });

  it("the hard caps hold whatever a caller asks", () => {
    expect(HARD_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(HARD_TIMEOUT_MS).toBe(60_000);
  });

  it("a timeout longer than the hard limit is cut to it", async () => {
    route("site.test/", html("ok"));
    const spy = vi.spyOn(globalThis, "setTimeout");
    await (await guardedFetch("http://site.test/", { timeoutMs: 10 * 60_000 })).text();
    const delays = spy.mock.calls.map((c) => c[1]);
    expect(delays).toContain(HARD_TIMEOUT_MS);
    // The ten minutes asked for are never set (undici's own timers are its business, not this limit).
    expect(delays).not.toContain(10 * 60_000);
  });

  it("allowedContentTypes: anything else is refused; by default nothing is checked", async () => {
    route("site.test/data", (_req, res) => {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end("{}");
    });
    expect(
      (await refusal(guardedFetch("http://site.test/data", { allowedContentTypes: ["text/html"] })))
        .code,
    ).toBe("bad_content_type");
    expect(
      (await guardedFetch("http://site.test/data", { allowedContentTypes: ["application/json"] }))
        .status,
    ).toBe(200);
    expect((await guardedFetch("http://site.test/data")).status).toBe(200);
  });

  it("a slow answer times out with an error named TimeoutError (read as 'timed out')", async () => {
    route("site.test/slow", (_req, res) => {
      setTimeout(() => {
        res.writeHead(200);
        res.end("late");
      }, 1500);
    });
    const err = await refusal(guardedFetch("http://site.test/slow", { timeoutMs: 200 }));
    expect(err.code).toBe("timeout");
    expect(err.name).toBe("TimeoutError");
    expect(outcomeForError(err)).toEqual({ state: "unchecked", reason: "timed out" });
  });

  it("headersTimeoutMs limits the headers; the body then has the overall limit", async () => {
    route("site.test/trickle", (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("a");
      setTimeout(() => res.end("b"), 400);
    });
    const res = await guardedFetch("http://site.test/trickle", {
      headersTimeoutMs: 200,
      timeoutMs: 5000,
    });
    expect(await res.text()).toBe("ab");
    const stalled = await guardedFetch("http://site.test/trickle", { timeoutMs: 200 });
    const err = await stalled.text().catch((e: unknown) => e);
    expect((err as Error).name).toBe("TimeoutError");
  });

  it("the caller's own abort signal stops it", async () => {
    route("site.test/slow", (_req, res) => {
      setTimeout(() => res.end("late"), 1500);
    });
    const err = await guardedFetch("http://site.test/slow", {
      signal: AbortSignal.timeout(100),
    }).catch((e: unknown) => e);
    expect((err as Error).name).toBe("TimeoutError");
  });
});

describe("robots.txt and pace (per caller, off by default)", () => {
  beforeEach(() => {
    route("site.test/robots.txt", (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: Vunnara-Audit-Bot\nDisallow: /private\n\nUser-agent: *\nDisallow: /\n");
    });
    route("site.test/private", html("secret"));
    route("site.test/public", html("open"));
  });

  it("obeyRobots: the bot's own group, then *: refused where disallowed", async () => {
    const ua = { "User-Agent": "Vunnara-Audit-Bot/1.0 (+https://vunnara.com.au/about)" };
    expect(
      (await refusal(guardedFetch("http://site.test/private", { headers: ua, obeyRobots: true })))
        .code,
    ).toBe("blocked_by_robots");
    expect(
      (await guardedFetch("http://site.test/public", { headers: ua, obeyRobots: true })).status,
    ).toBe(200);
    // Another agent falls to the * group, which disallows everything.
    expect(
      (
        await refusal(
          guardedFetch("http://site.test/public", {
            headers: { "User-Agent": "Other/1" },
            obeyRobots: true,
          }),
        )
      ).code,
    ).toBe("blocked_by_robots");
  });

  it("off by default: robots.txt isn't read and nothing is refused for it", async () => {
    expect(await (await guardedFetch("http://site.test/private")).text()).toBe("secret");
    expect(seen.map((s) => s.path)).toEqual(["/private"]);
  });

  it("perHostIntervalMs paces requests to one host", async () => {
    const started = Date.now();
    await (await guardedFetch("http://site.test/public", { perHostIntervalMs: 300 })).text();
    await (await guardedFetch("http://site.test/public", { perHostIntervalMs: 300 })).text();
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
  });
});

describe("refusals are logged with the host and reason only", () => {
  it("no path, no query, no address, no content", async () => {
    testNetwork.host("secret-host.test", ["10.9.9.9"]);
    const warn = vi.mocked(console.warn);
    await refusal(guardedFetch("http://secret-host.test/private/path?token=abc123"));
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(JSON.parse(line)).toEqual({
      event: "guarded_fetch_refused",
      host: "secret-host.test",
      reason: "blocked_address",
      detail: "private",
    });
    expect(line).not.toMatch(/private\/path|token|abc123|10\.9\.9\.9/);
  });
});

describe("parity with fetch (a real fetch to the same local server)", () => {
  /** The same response through both: real fetch to 127.0.0.1, guarded fetch through the fixture name. */
  async function both(path: string, init: { method?: "GET" | "POST"; body?: string } = {}) {
    const real = await fetch(`http://127.0.0.1:${port}${path}`, init);
    const guarded = await guardedFetch(`http://site.test${path}`, init);
    return {
      real: {
        status: real.status,
        statusText: real.statusText,
        headers: [...real.headers],
        body: await real.text(),
      },
      guarded: {
        status: guarded.status,
        statusText: guarded.statusText,
        headers: [...guarded.headers],
        body: await guarded.text(),
      },
    };
  }

  it("the same request headers (fetch's defaults; a caller's User-Agent wins)", async () => {
    route("*/echo", html("ok"));
    await (await fetch(`http://127.0.0.1:${port}/echo`)).text();
    await (await guardedFetch("http://site.test/echo")).text();
    await (
      await fetch(`http://127.0.0.1:${port}/echo`, { headers: { "User-Agent": "Bot/1" } })
    ).text();
    await (
      await guardedFetch("http://site.test/echo", { headers: { "User-Agent": "Bot/1" } })
    ).text();
    const strip = (h: Record<string, string>) => {
      const { host: _h, ...rest } = h;
      return rest;
    };
    expect(strip(seen[1].headers)).toEqual(strip(seen[0].headers));
    expect(strip(seen[3].headers)).toEqual(strip(seen[2].headers));
  });

  it("https asks for br as fetch does", async () => {
    route("site.test/", html("ok"));
    await (await guardedFetch("https://site.test/")).text();
    expect(seen[0].headers["accept-encoding"]).toBe("br, gzip, deflate");
  });

  const encodings: Array<[string, (b: Buffer) => Buffer]> = [
    ["gzip", (b) => zlib.gzipSync(b)],
    ["x-gzip", (b) => zlib.gzipSync(b)],
    ["deflate", (b) => zlib.deflateSync(b)],
    ["deflate-raw", (b) => zlib.deflateRawSync(b)],
    ["br", (b) => zlib.brotliCompressSync(b)],
    ["gzip, br", (b) => zlib.brotliCompressSync(zlib.gzipSync(b))],
    ["unknown-coding", (b) => b],
  ];
  for (const [coding, encode] of encodings) {
    it(`content-encoding ${coding}: the same status, headers and decoded body`, async () => {
      const text = "<html><body>Ünïcode café ✓</body></html>".repeat(50);
      route(`*/enc`, (_req, res) => {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-encoding": coding === "deflate-raw" ? "deflate" : coding,
          "set-cookie": ["a=1", "b=2"],
          "x-dup": ["1", "2"],
        });
        res.end(encode(Buffer.from(text)));
      });
      const { real, guarded } = await both("/enc");
      expect(guarded.body).toBe(real.body);
      expect(guarded.status).toBe(real.status);
      expect(guarded.statusText).toBe(real.statusText);
      const drop = (h: [string, string][]) =>
        h.filter(([k]) => k !== "date" && k !== "keep-alive" && k !== "connection");
      expect(drop(guarded.headers)).toEqual(drop(real.headers));
    });
  }

  it("statuses: 404, 500, 204, and a non-standard 999", async () => {
    route("*/missing", (_req, res) => {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("nope");
    });
    route("*/broken", (_req, res) => {
      res.writeHead(500);
      res.end();
    });
    route("*/empty", (_req, res) => {
      res.writeHead(204);
      res.end();
    });
    for (const path of ["/missing", "/broken", "/empty"]) {
      const { real, guarded } = await both(path);
      expect(guarded.status).toBe(real.status);
      expect(guarded.body).toBe(real.body);
    }
    route("*/odd", (_req, res) => {
      res.writeHead(999, "Request denied");
      res.end("no");
    });
    const odd = await guardedFetch("http://site.test/odd");
    expect(odd.status).toBe(999);
    expect(odd.ok).toBe(false);
  });

  it("a POST body arrives as fetch sends it (content-type, length)", async () => {
    route("*/post", (req, res) => {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(`${req.headers["content-type"]} ${req.headers["content-length"]} ${body}`);
      });
    });
    const { real, guarded } = await both("/post", { method: "POST", body: "héllo" });
    expect(guarded.body).toBe(real.body);
  });
});
