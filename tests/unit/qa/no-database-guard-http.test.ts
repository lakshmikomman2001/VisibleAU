/**
 * S02 part 0 (S01B's report, carried): the no-database guard missed two ways of opening a socket that the network
 * guard (tests/helpers/no-network-guard.ts, S01B part 3) already handles -- `http` passes the URL's `path: null`, which
 * the guard read as an IPC pipe, and `net.connect(options)` hands Socket#connect its arguments as one normalized array.
 * Either could reach a Postgres port from a unit test. Both are refused and recorded now, like postgres.js's connect.
 */
import http from "node:http";
import net from "node:net";
import { describe, expect, it } from "vitest";
import { NO_DATABASE_MESSAGE, takeDatabaseAttempts } from "../../helpers/no-database-guard";

const refusal = (open: () => { on: (e: "error", f: (err: Error) => void) => unknown }) =>
  new Promise<Error | null>((resolve) => {
    const target = open();
    target.on("error", resolve);
    setTimeout(() => resolve(null), 3_000);
  });

describe("a connection to a Postgres port opened another way", () => {
  it("an http request (path: null) is refused and recorded", async () => {
    takeDatabaseAttempts();
    const error = await refusal(() => {
      const req = http.request({ host: "127.0.0.1", port: 5432, path: "/", method: "GET" });
      req.end();
      return req;
    });
    expect(error?.message).toContain(NO_DATABASE_MESSAGE);
    expect(takeDatabaseAttempts()).toMatchObject([{ host: "127.0.0.1", port: 5432 }]);
  });

  it("net.connect(options) (net's normalized arguments) is refused and recorded", async () => {
    takeDatabaseAttempts();
    const error = await refusal(() => net.connect({ host: "127.0.0.1", port: 6543 }));
    expect(error?.message).toContain(NO_DATABASE_MESSAGE);
    expect(takeDatabaseAttempts()).toMatchObject([{ host: "127.0.0.1", port: 6543 }]);
  });

  it("an IPC pipe (a non-empty path) still goes through untouched", () => {
    const socket = net.connect({ path: "\\\\.\\pipe\\visibleau-no-such-pipe" });
    socket.on("error", () => undefined);
    socket.destroy();
    expect(takeDatabaseAttempts()).toEqual([]);
  });
});
