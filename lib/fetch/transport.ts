import type { LookupAddress } from "node:dns";
import { promises as dns } from "node:dns";
import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

/**
 * S00B part 2: the two network steps of the guarded fetcher (./guarded-fetch.ts), and nothing else. Production
 * resolves with the system resolver (what `fetch` uses) and connects with Node's own sockets.
 *
 * DNS pinning: `resolveHost` runs once per request hop; the guarded fetcher checks every address it returns and
 * hands the checked list to `connectPinned`, whose `lookup` answers with that list. Node never resolves the name
 * a second time, so a DNS answer that changes between the check and the connection (rebinding) can't move the
 * request. TLS still sends the original host name as SNI and checks the certificate against it.
 *
 * Tests swap this module with `vi.mock` (tests/unit/fetch/guarded-fetch.test.ts) to resolve fixture names and to
 * reach a local server; nothing in production code can (tests/unit/fetch/guarded-fetch-injection-guard.test.ts:
 * no environment switch, no setter, and only guarded-fetch.ts imports it).
 */

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/** Every address the system resolver gives for a host name, in its order. */
export async function resolveHost(hostname: string): Promise<ResolvedAddress[]> {
  const answers = await dns.lookup(hostname, { all: true, verbatim: true });
  return answers.map((a: LookupAddress) => ({
    address: a.address,
    family: a.family === 6 ? 6 : 4,
  }));
}

export interface PinnedTarget {
  protocol: "http:" | "https:";
  /** The URL's host name: the TLS server name and certificate name. Never re-resolved. */
  hostname: string;
  port: number;
  /** The checked addresses, in the resolver's order; the connection uses only these. */
  addresses: readonly ResolvedAddress[];
  /** False for an IP literal, which TLS must not send as SNI. */
  sendServerName: boolean;
}

/**
 * Opens the connection to one of the checked addresses (Happy Eyeballs across them, as `fetch` does). The
 * returned socket is plain TCP for http: and TLS for https:.
 */
export function connectPinned(target: PinnedTarget): Socket {
  const pinned = target.addresses.map((a) => ({ address: a.address, family: a.family }));
  const lookup = (
    _hostname: string,
    options: { all?: boolean },
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ): void => {
    if (options.all) callback(null, pinned);
    else callback(null, pinned[0].address, pinned[0].family);
  };
  const common = {
    host: target.hostname,
    port: target.port,
    lookup,
    autoSelectFamily: true,
  };
  if (target.protocol === "http:") return netConnect(common);
  return tlsConnect({
    ...common,
    ...(target.sendServerName ? { servername: target.hostname } : {}),
    ALPNProtocols: ["http/1.1"],
  });
}
