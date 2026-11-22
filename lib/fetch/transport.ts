import type { LookupAddress } from "node:dns";
import { promises as dns } from "node:dns";
import type { LookupFunction } from "node:net";
import { Agent, type Dispatcher } from "undici";

/**
 * S00B part 2: the guarded fetcher's two network pieces (./guarded-fetch.ts), and nothing else.
 *
 * - `resolveHost`: the system resolver, which `fetch` uses too.
 * - `createDispatcher`: the connection pool `fetch` is given for every guarded request (`fetch(url, {dispatcher})`;
 *   undici 7, the same code as Node's own `fetch`). Its connections take their address from the guarded
 *   fetcher's lookup, which resolves the name once, checks every answer and hands back only checked ones: the
 *   socket connects to exactly what was checked (DNS pinning), so an answer that changes between the check and the
 *   connection (rebinding) can't move the request. TLS keeps the original name for SNI and the certificate.
 *
 * Tests swap this module with `vi.mock` (tests/helpers/guarded-fetch-test-transport.ts) to resolve fixture names
 * and reach a local server; nothing in production code can (tests/unit/fetch/guarded-fetch-injection-guard.test.ts:
 * no environment switch, no setter, and only guarded-fetch.ts imports this).
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

/** The pool `fetch` uses for guarded requests: every new connection's address comes from `lookup`. */
export function createDispatcher(lookup: LookupFunction): Dispatcher {
  return new Agent({ connect: { lookup, autoSelectFamily: true } });
}
