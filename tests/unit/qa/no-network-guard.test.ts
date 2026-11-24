/**
 * S01B part 3 (LLD amendment 50): the unit and integration workers refuse the network (tests/no-network.setup.ts,
 * tests/helpers/no-network-guard.ts). Proves, in a real unit worker with the guard as the setup installs it:
 * - an outbound fetch, a node:http request, a raw TCP or TLS connect and a DNS query fail fast, with an error that
 *   names the host and says "tests must not reach the network; record a fixture";
 * - a refusal the code under test swallows still fails the test (the attempt is recorded);
 * - this machine stays reachable: a local server by address or by "localhost", and S00B's pinning dispatcher, whose
 *   own lookup sends a made-up name to 127.0.0.1 (tests/unit/fetch/guarded-fetch-real-transport.test.ts);
 * - a lookup that hands back an outside address is refused at the connect.
 * Only reserved names (.invalid, RFC 2606) and documentation addresses (192.0.2.0/24, RFC 5737) are used, so even
 * without the guard nothing here reaches anyone.
 */
import dnsDefault, { lookup as namedLookup } from "node:dns";
import { once } from "node:events";
import http from "node:http";
import net, { type AddressInfo, type LookupFunction } from "node:net";
import tls from "node:tls";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDispatcher } from "@/lib/fetch/transport";
import {
  isAllowedHost,
  type NetworkAttempt,
  NO_NETWORK_MESSAGE,
  takeNetworkAttempts,
} from "@/tests/helpers/no-network-guard";

const OUTSIDE_NAME = "network-guard-check.invalid";
const OUTSIDE_ADDRESS = "192.0.2.10";
/** Fast: well under the second a real connect or DNS timeout would take. */
const FAST_MS = 1000;

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain", connection: "close" });
    res.end(`host=${req.headers.host}`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

// Each test below makes its refusals on purpose and checks them; what's left would fail the test (the setup's own
// afterEach), so none may be left.
afterEach(() => {
  expect(takeNetworkAttempts()).toEqual([]);
});

/** The error a call ends with, within FAST_MS (a timer fails the test otherwise). */
async function failure(run: () => Promise<unknown>): Promise<{ error: Error; ms: number }> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no refusal within ${FAST_MS} ms`)), FAST_MS);
  });
  try {
    await Promise.race([run(), slow]);
  } catch (err) {
    return { error: err as Error, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
  throw new Error("the call succeeded");
}

/** The message of an error or of its cause (fetch wraps the socket's error as "fetch failed"). */
const messageOf = (e: Error) =>
  [e.message, (e as Error & { cause?: Error }).cause?.message].filter(Boolean).join(" | ");

function expectRefused(
  error: Error,
  host: string,
  taken: NetworkAttempt[],
  via: NetworkAttempt["via"],
) {
  expect(messageOf(error)).toContain(host);
  expect(messageOf(error)).toContain(NO_NETWORK_MESSAGE);
  expect(taken).toHaveLength(1);
  expect(taken[0]).toMatchObject({ via });
  expect(taken[0].host).toContain(host);
  expect(taken[0].test).toContain("no-network-guard.test.ts");
}

describe("the network guard (tests/no-network.setup.ts)", () => {
  it("an outbound fetch fails fast, naming the host and saying to record a fixture", async () => {
    const { error, ms } = await failure(() => fetch(`https://${OUTSIDE_NAME}/robots.txt`));
    expect(ms).toBeLessThan(FAST_MS);
    expectRefused(error, OUTSIDE_NAME, takeNetworkAttempts(), "fetch");
  });

  it("a DNS lookup of a name that isn't local fails fast (callback, promise and ESM forms)", async () => {
    const viaPromise = await failure(() => dnsDefault.promises.lookup(OUTSIDE_NAME));
    expectRefused(viaPromise.error, OUTSIDE_NAME, takeNetworkAttempts(), "dns");

    const viaCallback = await failure(
      () =>
        new Promise((resolve, reject) =>
          dnsDefault.lookup(OUTSIDE_NAME, (e, a) => (e ? reject(e) : resolve(a))),
        ),
    );
    expectRefused(viaCallback.error, OUTSIDE_NAME, takeNetworkAttempts(), "dns");

    const viaNamed = await failure(
      () =>
        new Promise((resolve, reject) =>
          namedLookup(OUTSIDE_NAME, (e, a) => (e ? reject(e) : resolve(a))),
        ),
    );
    expectRefused(viaNamed.error, OUTSIDE_NAME, takeNetworkAttempts(), "dns");

    const resolved = await failure(() => dnsDefault.promises.resolve4(OUTSIDE_NAME));
    expectRefused(resolved.error, OUTSIDE_NAME, takeNetworkAttempts(), "dns");
    const reversed = await failure(() =>
      new dnsDefault.promises.Resolver().reverse(OUTSIDE_ADDRESS),
    );
    expectRefused(reversed.error, OUTSIDE_ADDRESS, takeNetworkAttempts(), "dns");
  });

  it("node:http, and raw TCP and TLS connects to an outside host, fail fast", async () => {
    const viaHttp = await failure(
      () =>
        new Promise((resolve, reject) => {
          http.get(`http://${OUTSIDE_NAME}/`, resolve).on("error", reject);
        }),
    );
    expectRefused(viaHttp.error, OUTSIDE_NAME, takeNetworkAttempts(), "connect");

    const viaNet = await failure(
      () =>
        new Promise((resolve, reject) => {
          net
            .connect({ host: OUTSIDE_ADDRESS, port: 443 }, () => resolve("connected"))
            .on("error", reject);
        }),
    );
    expectRefused(viaNet.error, OUTSIDE_ADDRESS, takeNetworkAttempts(), "connect");

    const viaTls = await failure(
      () =>
        new Promise((resolve, reject) => {
          tls
            .connect({ host: OUTSIDE_NAME, port: 443 }, () => resolve("connected"))
            .on("error", reject);
        }),
    );
    expectRefused(viaTls.error, OUTSIDE_NAME, takeNetworkAttempts(), "connect");
  });

  it("a refusal the code under test swallows is still recorded, so the test fails", async () => {
    const quiet = await fetch(`https://${OUTSIDE_NAME}/`).then(
      () => "answered",
      () => "swallowed",
    );
    expect(quiet).toBe("swallowed");
    const taken = takeNetworkAttempts();
    expect(taken.map((a) => a.host)).toEqual([OUTSIDE_NAME]);
  });

  it("this machine stays reachable: a local server by address and by localhost", async () => {
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe(`host=127.0.0.1:${port}`);
    expect(await (await fetch(`http://localhost:${port}/`)).text()).toBe(`host=localhost:${port}`);
    const viaHttp = await new Promise<string>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/`, (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve(body));
        })
        .on("error", reject);
    });
    expect(viaHttp).toBe(`host=127.0.0.1:${port}`);
    expect(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].every(isAllowedHost)).toBe(true);
    expect(
      [OUTSIDE_NAME, OUTSIDE_ADDRESS, "abr.business.gov.au", "en.wikipedia.org"].some(
        isAllowedHost,
      ),
    ).toBe(false);
  });

  it("S00B's pinning dispatcher still reaches its local server under a made-up name; an outside answer is refused", async () => {
    const toLocal: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, [{ address: "127.0.0.1", family: 4 }]);
      else callback(null, "127.0.0.1", 4);
    };
    const res = await fetch(`http://pinned.does-not-exist.invalid:${port}/`, {
      dispatcher: createDispatcher(toLocal),
    } as RequestInit);
    expect(await res.text()).toBe(`host=pinned.does-not-exist.invalid:${port}`);

    const toOutside: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, [{ address: OUTSIDE_ADDRESS, family: 4 }]);
      else callback(null, OUTSIDE_ADDRESS, 4);
    };
    const { error, ms } = await failure(() =>
      fetch(`http://pinned.does-not-exist.invalid:${port}/`, {
        dispatcher: createDispatcher(toOutside),
      } as RequestInit),
    );
    expect(ms).toBeLessThan(FAST_MS);
    expectRefused(error, OUTSIDE_ADDRESS, takeNetworkAttempts(), "connect");
  });
});
