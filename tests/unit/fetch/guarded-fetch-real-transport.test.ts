/**
 * S00B part 2: the real transport (no vi.mock). The guarded fetcher refuses loopback through production code too,
 * and the pinned connection never asks DNS again: a name that doesn't exist reaches the address it was given.
 */
import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GuardedFetchError, guardedFetch } from "@/lib/fetch/guarded-fetch";
import { connectPinned, resolveHost } from "@/lib/fetch/transport";

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
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

  it("connectPinned connects to the pinned address and never resolves the name (it doesn't exist)", async () => {
    const socket = connectPinned({
      protocol: "http:",
      hostname: "pinned.does-not-exist.invalid",
      port,
      addresses: [{ address: "127.0.0.1", family: 4 }],
      sendServerName: true,
    });
    await once(socket, "connect");
    socket.write(
      "GET / HTTP/1.1\r\nHost: pinned.does-not-exist.invalid\r\nConnection: close\r\n\r\n",
    );
    let reply = "";
    socket.on("data", (d) => {
      reply += d;
    });
    await once(socket, "end");
    expect(reply).toContain("host=pinned.does-not-exist.invalid");
  });
});
