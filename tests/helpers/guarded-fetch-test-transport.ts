/**
 * S00B part 2: the guarded fetcher's network, for tests only. A test file replaces lib/fetch/transport.ts with this
 * module (`vi.mock("@/lib/fetch/transport", () => import("../../helpers/guarded-fetch-test-transport"))`), then:
 * - `testNetwork.dns` says what each fixture host name resolves to (a list of answers is given out in turn, the
 *   last one repeating: DNS rebinding);
 * - `testNetwork.servers` maps a public-looking fixture address to the port of a local server.
 *
 * The dispatcher is a real undici Agent whose connector does what the production one does -- asks the guarded
 * fetcher's own lookup (which resolves through `resolveHost` here and checks every answer), and connects to what it
 * hands back -- except that it connects to 127.0.0.1 on the mapped port instead (plain TCP even for https:, so
 * fixture sites need no certificates). An IP literal skips the lookup, as Node's sockets do.
 *
 * Production code can't reach this: lib/fetch has no switch or setter for it
 * (tests/unit/fetch/guarded-fetch-injection-guard.test.ts).
 */
import type { LookupAddress } from "node:dns";
import { isIP, type LookupFunction, connect as netConnect } from "node:net";
import { Agent, type Dispatcher } from "undici";
import type { ResolvedAddress } from "@/lib/fetch/transport";

export type { ResolvedAddress };

export interface TestConnection {
  protocol: string;
  hostname: string;
  port: number;
  /** What the guarded fetcher's lookup handed the socket (or the IP literal itself). */
  addresses: ResolvedAddress[];
}

export const testNetwork = {
  dns: new Map<string, ResolvedAddress[][]>(),
  servers: new Map<string, number>(),
  /** Every host name asked of the resolver, in order. */
  lookups: [] as string[],
  /** Every connection opened, in order. */
  connects: [] as TestConnection[],
  reset(): void {
    this.dns.clear();
    this.servers.clear();
    this.lookups.length = 0;
    this.connects.length = 0;
  },
  /** One fixture host name answering with these addresses (each "a.b.c.d" or IPv6 text). */
  host(name: string, ...answers: string[][]): void {
    this.dns.set(
      name,
      answers.map((list) =>
        list.map(
          (address) => ({ address, family: address.includes(":") ? 6 : 4 }) as ResolvedAddress,
        ),
      ),
    );
  },
};

export async function resolveHost(hostname: string): Promise<ResolvedAddress[]> {
  testNetwork.lookups.push(hostname);
  const answers = testNetwork.dns.get(hostname);
  if (!answers || answers.length === 0) {
    throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" });
  }
  return answers.length > 1 ? (answers.shift() as ResolvedAddress[]) : answers[0];
}

function lookupAll(lookup: LookupFunction, hostname: string): Promise<ResolvedAddress[]> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare)) return Promise.resolve([{ address: bare, family: isIP(bare) === 6 ? 6 : 4 }]);
  return new Promise((resolve, reject) => {
    lookup(bare, { all: true }, (err, addresses) => {
      if (err) reject(err);
      else
        resolve(
          (addresses as LookupAddress[]).map((a) => ({
            address: a.address,
            family: a.family === 6 ? 6 : 4,
          })),
        );
    });
  });
}

export function createDispatcher(lookup: LookupFunction): Dispatcher {
  return new Agent({
    connect: (options, callback) => {
      const hostname = String(options.hostname);
      lookupAll(lookup, hostname).then(
        (addresses) => {
          const port = Number(options.port) || (options.protocol === "https:" ? 443 : 80);
          testNetwork.connects.push({
            protocol: String(options.protocol),
            hostname,
            port,
            addresses,
          });
          const local = testNetwork.servers.get(addresses[0]?.address ?? "");
          if (local === undefined) {
            callback(
              Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
              null,
            );
            return;
          }
          const socket = netConnect({ host: "127.0.0.1", port: local });
          socket.once("connect", () => callback(null, socket));
          socket.once("error", (err) => callback(err, null));
        },
        (err: Error) => callback(err, null),
      );
    },
  });
}
