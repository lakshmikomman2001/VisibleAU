/**
 * S01B part 3 (LLD amendment 50): unit and integration tests never reach the network. In S01 Part 9 a test once ran
 * the real Enhanced-check runners: a crawl of the fixture's made-up domain through the guarded fetcher, and a
 * Wikipedia search. This refuses every outbound connection a test worker makes except to this machine (localhost,
 * 127.0.0.0/8, ::1) and the test database's host, and every DNS query for a name that isn't local, at four places:
 * - `net.Socket#connect` (which `node:http`, `node:https`, `tls` and undici all end in): an IP address is judged
 *   as it is; a name with its own `lookup` (S00B's pinning dispatcher) is judged by the address that lookup gives,
 *   so a test's own local server stays reachable under any name; any other name must be local;
 * - `dns.lookup` / `dns.promises.lookup` for a name that isn't local (an IP literal needs no query);
 * - `dns` resolve and reverse queries (module functions, `dns.promises`, and both `Resolver` classes), which always
 *   ask a DNS server;
 * - Node's global `fetch` dispatcher (undici's), refusing before a socket is opened.
 * A refusal fails fast with an error that names the host and says NO_NETWORK_MESSAGE, and is recorded, so
 * `assertNoNetworkAttempts()` fails the test even when the code under test catches that error (as the no-database
 * guard does, tests/helpers/no-database-guard.ts). Installed in every unit and integration worker by
 * tests/no-network.setup.ts. Playwright is out of scope (its server is local).
 */
import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import { Agent, buildConnector, setGlobalDispatcher } from "undici";

export const NO_NETWORK_MESSAGE = "tests must not reach the network; record a fixture";

export interface NetworkAttempt {
  /** Repo-relative test file, and the test running when it happened (if any). */
  test: string;
  /** The first repo file on the calling stack outside node_modules and this guard, when V8 kept one. */
  from: string | null;
  /** What was asked for: the host (and port), or the DNS query. */
  host: string;
  port: number | null;
  via: "connect" | "dns" | "fetch";
}

interface GuardState {
  installed: boolean;
  attempts: NetworkAttempt[];
  allowedHosts: Set<string>;
  describeTest: () => string;
}

const STATE_KEY = Symbol.for("visibleau.tests.noNetworkGuard");
type GlobalWithGuard = typeof globalThis & { [STATE_KEY]?: GuardState };

function state(): GuardState {
  const g = globalThis as GlobalWithGuard;
  g[STATE_KEY] ??= {
    installed: false,
    attempts: [],
    allowedHosts: new Set(),
    describeTest: () => "?",
  };
  return g[STATE_KEY];
}

const bare = (host: string) =>
  host
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();

/** This machine: 127.0.0.0/8, ::1, the unspecified addresses (which connect locally), and their IPv4-mapped forms. */
export function isLocalAddress(address: string): boolean {
  const a = bare(address);
  if (a === "::1" || a === "::" || a === "0.0.0.0") return true;
  const v4 = a.startsWith("::ffff:") ? a.slice("::ffff:".length) : a;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4);
}

/** A name or address a test may reach: this machine, or a host allowed by `allowNetworkHosts` (the test database). */
export function isAllowedHost(host: string): boolean {
  const h = bare(host);
  if (state().allowedHosts.has(h)) return true;
  if (net.isIP(h)) return isLocalAddress(h);
  return h === "localhost" || h.endsWith(".localhost");
}

/** Adds hosts tests may reach besides this machine: the test database's host, read from its URL. */
export function allowNetworkHosts(hosts: Iterable<string>): void {
  for (const h of hosts) if (h) state().allowedHosts.add(bare(h));
}

/** The hosts in the database variables of `env` (DATABASE_URL, SERVICE_DATABASE_URL, DIRECT_URL, PGHOST, ...). */
export function databaseHostsIn(env: Record<string, string | undefined>): string[] {
  const hosts: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    if (name === "PGHOST") hosts.push(value);
    else if (/DATABASE_URL|^DIRECT_URL$|^POSTGRES_URL/.test(name)) {
      try {
        hosts.push(new URL(value).hostname);
      } catch {
        // Not a URL: nothing to allow.
      }
    }
  }
  return hosts;
}

const SOURCE_FILE = /^([^():]+?\.(?:ts|tsx|js|mjs))/;

function callerFile(stack: string | undefined): string | null {
  const root = `${process.cwd().replace(/\\/g, "/").toLowerCase()}/`;
  for (const raw of (stack ?? "").split("\n").slice(1)) {
    const line = raw.replace(/\\/g, "/");
    const at = line.toLowerCase().indexOf(root);
    if (at === -1) continue;
    const m = SOURCE_FILE.exec(line.slice(at + root.length));
    if (m && !m[1].startsWith("node_modules/") && !m[1].includes("no-network")) return m[1];
  }
  return null;
}

export function describeNetworkAttempt(a: NetworkAttempt): string {
  const where = a.port === null ? a.host : `${a.host}:${a.port}`;
  const what = a.via === "dns" ? `a DNS query for ${where}` : `a connection to ${where}`;
  return `${where}: ${NO_NETWORK_MESSAGE} (${a.from ?? a.test} made ${what}${a.from ? `, in ${a.test}` : ""}).`;
}

/** Records the attempt and returns the error that refuses it. */
function refusal(via: NetworkAttempt["via"], host: string, port: number | null): Error {
  const s = state();
  const attempt: NetworkAttempt = {
    test: s.describeTest(),
    from: callerFile(new Error().stack),
    host,
    port,
    via,
  };
  s.attempts.push(attempt);
  const error = new Error(describeNetworkAttempt(attempt)) as Error & { code: string };
  error.code = "ETESTNONETWORK";
  return error;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;
type Lookup = (hostname: string, options: dns.LookupOptions, callback: LookupCallback) => void;

/**
 * [host, port, lookup] from the forms net.Socket#connect takes: (options), (port[, host]), and the array net.connect
 * and tls.connect pass it already normalized ([options, callback]); null for IPC paths.
 */
function connectTarget(args: unknown[]): { host: string; port: number; lookup?: Lookup } | null {
  const [first, second] = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  if (first && typeof first === "object") {
    const opts = first as {
      port?: number | string;
      host?: string;
      path?: string | null;
      lookup?: Lookup;
    };
    // Node treats only a non-empty path as a pipe (http passes the URL's path: null).
    if (opts.path || opts.port === undefined) return null;
    return { host: opts.host ?? "localhost", port: Number(opts.port), lookup: opts.lookup };
  }
  if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) {
    return { port: Number(first), host: typeof second === "string" ? second : "localhost" };
  }
  return null;
}

/** A connect's own lookup, checked: the address it hands back must be one a test may reach. */
function checkedLookup(lookup: Lookup, port: number): Lookup {
  return (hostname, options, callback) =>
    lookup(hostname, options, (err, address, family) => {
      if (err) return callback(err, address, family);
      const addresses = Array.isArray(address) ? address.map((a) => a.address) : [address];
      const outside = addresses.find((a) => !isAllowedHost(a));
      if (outside !== undefined)
        return callback(refusal("connect", `${hostname} (${outside})`, port), address, family);
      callback(null, address, family);
    });
}

function patchConnect(): void {
  const realConnect = net.Socket.prototype.connect;
  // net.Socket#connect is overloaded; the guard forwards whatever it was given, untouched unless it refuses it.
  function guardedConnect(this: net.Socket, ...args: unknown[]): net.Socket {
    const to = connectTarget(args);
    if (!to) return Reflect.apply(realConnect, this, args) as net.Socket;
    if (!net.isIP(bare(to.host)) && to.lookup) {
      const lookup = checkedLookup(to.lookup, to.port);
      if (Array.isArray(args[0])) {
        // net.connect's normalized array (it carries Node's own marker): replace its options in place, a copy.
        const normalized = args[0] as unknown[];
        normalized[0] = { ...(normalized[0] as object), lookup };
        return Reflect.apply(realConnect, this, args) as net.Socket;
      }
      return Reflect.apply(realConnect, this, [
        { ...(args[0] as object), lookup },
        ...args.slice(1),
      ]) as net.Socket;
    }
    if (isAllowedHost(to.host)) return Reflect.apply(realConnect, this, args) as net.Socket;
    const error = refusal("connect", to.host, to.port);
    process.nextTick(() => this.destroy(error));
    return this;
  }
  net.Socket.prototype.connect = guardedConnect as unknown as typeof realConnect;
}

const RESOLVE_METHODS = [
  "resolve",
  "resolve4",
  "resolve6",
  "resolveAny",
  "resolveCaa",
  "resolveCname",
  "resolveMx",
  "resolveNaptr",
  "resolveNs",
  "resolvePtr",
  "resolveSoa",
  "resolveSrv",
  "resolveTxt",
  "reverse",
] as const;

type AnyFn = (...args: unknown[]) => unknown;

function patchDns(): void {
  const callbackApi = dns as unknown as Record<string, AnyFn>;
  const promiseApi = dns.promises as unknown as Record<string, AnyFn>;

  const realLookup = dns.lookup as unknown as AnyFn;
  callbackApi.lookup = function guardedLookup(hostname: unknown, ...rest: unknown[]) {
    const name = String(hostname);
    if (net.isIP(name) || isAllowedHost(name))
      return Reflect.apply(realLookup, dns, [hostname, ...rest]);
    const callback = rest[rest.length - 1] as LookupCallback;
    const error = refusal("dns", name, null);
    process.nextTick(() => callback(error, ""));
    return undefined;
  };
  const realPromiseLookup = promiseApi.lookup;
  promiseApi.lookup = async function guardedPromiseLookup(hostname: unknown, ...rest: unknown[]) {
    const name = String(hostname);
    if (net.isIP(name) || isAllowedHost(name))
      return Reflect.apply(realPromiseLookup, dns.promises, [hostname, ...rest]);
    throw refusal("dns", name, null);
  };

  // A resolve or reverse query always goes to a DNS server, whatever it asks about.
  const refuseCallback = (method: string) =>
    function refusedQuery(this: unknown, query: unknown, ...rest: unknown[]) {
      const callback = rest[rest.length - 1];
      const error = refusal("dns", `${method}(${String(query)})`, null);
      if (typeof callback === "function") process.nextTick(() => (callback as AnyFn)(error));
      return undefined;
    };
  const refusePromise = (method: string) =>
    async function refusedQuery(query: unknown) {
      throw refusal("dns", `${method}(${String(query)})`, null);
    };
  for (const method of RESOLVE_METHODS) {
    if (typeof callbackApi[method] === "function") callbackApi[method] = refuseCallback(method);
    if (typeof promiseApi[method] === "function") promiseApi[method] = refusePromise(method);
    const callbackProto = dns.Resolver.prototype as unknown as Record<string, AnyFn>;
    const promiseProto = dns.promises.Resolver.prototype as unknown as Record<string, AnyFn>;
    if (typeof callbackProto[method] === "function") callbackProto[method] = refuseCallback(method);
    if (typeof promiseProto[method] === "function") promiseProto[method] = refusePromise(method);
  }
}

function patchGlobalFetch(): void {
  const connect = buildConnector({});
  setGlobalDispatcher(
    new Agent({
      connect(options, callback) {
        if (!isAllowedHost(options.hostname)) {
          const port = options.port
            ? Number(options.port)
            : options.protocol === "https:"
              ? 443
              : 80;
          return callback(refusal("fetch", options.hostname, port), null);
        }
        return connect(options, callback);
      },
    }),
  );
}

/**
 * Installs the guard in this worker. Safe to call more than once. `describeTest` names the running test for the
 * error and the record.
 */
export function installNoNetworkGuard(describeTest: () => string): void {
  const s = state();
  s.describeTest = describeTest;
  if (s.installed) return;
  s.installed = true;
  patchConnect();
  patchDns();
  patchGlobalFetch();
  // ESM `import { lookup } from "node:dns"` reads the patched functions too.
  syncBuiltinESMExports();
}

/** The attempts refused since the last call, cleared. */
export function takeNetworkAttempts(): NetworkAttempt[] {
  return state().attempts.splice(0);
}

/** Throws (failing the test it runs after) if anything tried to reach the network since the last check. */
export function assertNoNetworkAttempts(): void {
  const attempts = takeNetworkAttempts();
  if (attempts.length === 0) return;
  throw new Error(attempts.map(describeNetworkAttempt).join("\n"));
}
