/**
 * S00B part 2: the real transport (no vi.mock). The guarded fetcher refuses loopback through production code too,
 * and the production dispatcher connects to what its lookup hands it, never asking DNS itself: a name that doesn't
 * exist reaches the address it was given.
 */
import { once } from "node:events";
import http from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GuardedFetchError, guardedFetch } from "@/lib/fetch/guarded-fetch";
import { createDispatcher, resolveHost } from "@/lib/fetch/transport";

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

describe("the production transport", () => {
  it("refuses a loopback server through production code (the port, then the address, then the name)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(guardedFetch(`http://127.0.0.1:${port}/`)).rejects.toMatchObject({
      code: "blocked_port",
    });
    await expect(guardedFetch("http://127.0.0.1/")).rejects.toMatchObject({
      code: "blocked_address",
    });
    await expect(guardedFetch("http://localhost/")).rejects.toBeInstanceOf(GuardedFetchError);
    vi.restoreAllMocks();
  });

  it("resolveHost answers from the system resolver", async () => {
    const answers = await resolveHost("localhost");
    expect(answers.length).toBeGreaterThan(0);
    expect(answers.every((a) => a.address === "127.0.0.1" || a.address === "::1")).toBe(true);
  });

  it("the dispatcher connects to the address its lookup gives and keeps the original Host", async () => {
    const asked: string[] = [];
    const lookup: LookupFunction = (hostname, options, callback) => {
      asked.push(hostname);
      if (options.all) callback(null, [{ address: "127.0.0.1", family: 4 }]);
      else callback(null, "127.0.0.1", 4);
    };
    const res = await fetch(`http://pinned.does-not-exist.invalid:${port}/`, {
      dispatcher: createDispatcher(lookup),
    } as RequestInit);
    expect(await res.text()).toBe(`host=pinned.does-not-exist.invalid:${port}`);
    expect(asked).toEqual(["pinned.does-not-exist.invalid"]);
  });
});
