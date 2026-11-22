/**
 * S00B part 2: the guarded fetcher's network, for tests only. A test file replaces lib/fetch/transport.ts with this
 * module (`vi.mock("@/lib/fetch/transport", () => import("../../helpers/guarded-fetch-test-transport"))`), then:
 * - `testNetwork.dns` says what each fixture host name resolves to (a list of answers is given out in turn, the
 *   last one repeating: DNS rebinding);
 * - `testNetwork.servers` maps a public-looking fixture address to the port of a local server. The guarded fetcher
 *   checks and pins the fixture address, as it would a real one, and this connects to 127.0.0.1 instead (plain TCP
 *   even for https:, so fixture sites can be served without certificates).
 *
 * Production code can't reach this: lib/fetch has no switch or setter for it
 * (tests/unit/fetch/guarded-fetch-injection-guard.test.ts).
 */
import { connect, Socket } from "node:net";
import type { PinnedTarget, ResolvedAddress } from "@/lib/fetch/transport";

export type { PinnedTarget, ResolvedAddress };

export const testNetwork = {
  dns: new Map<string, ResolvedAddress[][]>(),
  servers: new Map<string, number>(),
  /** Every host name asked of the resolver, in order. */
  lookups: [] as string[],
  /** Every connection opened, in order. */
  connects: [] as PinnedTarget[],
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

export function connectPinned(target: PinnedTarget): Socket {
  testNetwork.connects.push(target);
  const port = testNetwork.servers.get(target.addresses[0]?.address ?? "");
  if (port === undefined) {
    const socket = new Socket();
    process.nextTick(() =>
      socket.destroy(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })),
    );
    return socket;
  }
  return connect({ host: "127.0.0.1", port });
}
