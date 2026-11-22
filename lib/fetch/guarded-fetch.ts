import type { LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";
import type { Dispatcher } from "undici";
import { evaluateRobotsForAgent } from "@/lib/robots-txt/evaluate";
import {
  type BlockedAddressReason,
  blockedAddressReason,
  blockedHostnameReason,
  ipLiteral,
} from "./address-policy";
import { createDispatcher, resolveHost } from "./transport";

/**
 * S00B part 2 (LLD 8.6.2, D-SEC1): the one way server code fetches a URL that came from a customer -- a brand's
 * domain, a link or redirect on their site, a sitemap their robots.txt names, a webhook endpoint, a logo URL.
 * docs/lld/fetch-inventory.md lists every caller.
 *
 * Always, for every caller:
 * - `http:` and `https:` only; ports 80 and 443 only; no user name or password in the URL;
 * - the host resolved once and every address checked (./address-policy.ts: private, loopback, link-local, CGNAT,
 *   multicast, broadcast, unspecified, reserved, IPv6 unique-local and link-local, IPv4-mapped, cloud metadata);
 *   an IP literal in any notation is checked the same way, without a lookup;
 * - the connection made to a checked address with the original Host header and TLS server name (DNS pinning:
 *   the dispatcher's lookup, ./transport.ts, answers only with addresses it has checked);
 * - every redirect checked again from the start;
 * - a hard overall time limit (HARD_TIMEOUT_MS) and a hard body cap (HARD_MAX_BYTES), whatever the caller asks.
 *
 * Per caller (options), each defaulting to what `fetch` did for the callers that existed before S00B: user agent
 * (`fetch`'s own when none is given), timeout, redirect mode and limit, byte limit, allowed content types (none
 * checked), robots.txt (not obeyed), a per-host pace (none), and whether plain `http:` is fetched (yes).
 *
 * The exchange itself is `fetch` (with `redirect: "manual"` and the pinned dispatcher), so request headers,
 * decoding, statuses, headers and network errors are exactly `fetch`'s, and so is every test that fakes `fetch`.
 * Redirects are followed here, `fetch`'s way (a POST becomes a GET after a 301/302/303), each hop checked. A
 * refusal is a GuardedFetchError with a code, logged with the host and the reason only (no path, no query, no
 * content); a timeout's error is named "TimeoutError", as an aborted `fetch` is, so every caller's existing
 * "timed out" / "no answer" handling (lib/crawler/fetch-outcome.ts) reads it unchanged.
 */

/** No request lasts longer than this, whatever the caller asks (the caller's own limit is usually far less). */
export const HARD_TIMEOUT_MS = 60_000;
/** No body is read past this, whatever the caller asks: the largest file the sitemap protocol allows. */
export const HARD_MAX_BYTES = 50 * 1024 * 1024;
/** The timeout when a caller gives none. */
export const DEFAULT_TIMEOUT_MS = 10_000;
/** `fetch`'s own redirect limit, the default and the ceiling. */
export const MAX_REDIRECTS = 20;

export type GuardedFetchErrorCode =
  | "blocked_address"
  | "blocked_scheme"
  | "blocked_port"
  | "blocked_credentials"
  | "blocked_by_robots"
  | "too_many_redirects"
  | "too_large"
  | "timeout"
  | "bad_content_type";

/** A request the guarded fetcher refused, or stopped. */
export class GuardedFetchError extends Error {
  readonly code: GuardedFetchErrorCode;
  /** The host the refusal was about (no path or query). */
  readonly host: string;
  /** For blocked_address: which kind of address (never the address itself). */
  readonly detail: BlockedAddressReason | null;

  constructor(
    code: GuardedFetchErrorCode,
    host: string,
    detail: BlockedAddressReason | null = null,
  ) {
    super(detail ? `${code} (${detail}): ${host}` : `${code}: ${host}`);
    // A timeout reads as an aborted fetch does (fetch-outcome.ts: "timed out"); every other refusal as no answer.
    this.name = code === "timeout" ? "TimeoutError" : "GuardedFetchError";
    this.code = code;
    this.host = host;
    this.detail = detail;
  }
}

export function isGuardedFetchError(err: unknown): err is GuardedFetchError {
  return err instanceof GuardedFetchError;
}

export interface GuardedFetchOptions {
  method?: "GET" | "HEAD" | "POST";
  /** Request headers. A "User-Agent" here wins; without one, `fetch`'s own is sent. */
  headers?: Record<string, string>;
  /** A request body (POST). */
  body?: string;
  /** The whole exchange, from the first lookup to the last byte of the body (default 10 s, at most 60 s). */
  timeoutMs?: number;
  /** An earlier limit for the response headers alone (the crawler's page timeout, which never covered the body). */
  headersTimeoutMs?: number;
  /** `fetch`'s modes: "follow" (default), "manual" (a 3xx is the answer), "error" (a redirect fails). */
  redirect?: "follow" | "manual" | "error";
  /** Redirects followed before giving up (default and ceiling 20, as `fetch`). */
  maxRedirects?: number;
  /** The decoded body's size limit (default and ceiling HARD_MAX_BYTES). */
  maxBytes?: number;
  /** Media types accepted (e.g. "text/html"); anything else is refused. Default: not checked. */
  allowedContentTypes?: readonly string[];
  /** Read the host's robots.txt first and refuse what it disallows for this user agent (default off). */
  obeyRobots?: boolean;
  /** At most one request to a host per this many milliseconds, in this process (default: no pace). */
  perHostIntervalMs?: number;
  /** Whether a plain http: URL, given or redirected to, is fetched (default true, as `fetch`). */
  allowHttp?: boolean;
  /** The caller's own abort signal. */
  signal?: AbortSignal;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);
const REQUEST_BODY_HEADERS = [
  "content-encoding",
  "content-language",
  "content-location",
  "content-type",
];
const ALLOWED_PORTS = new Set([80, 443]);

/** Logs a refusal: the host and the reason, never the path, query or content. */
function logRefusal(err: GuardedFetchError): void {
  console.warn(
    JSON.stringify({
      event: "guarded_fetch_refused",
      host: err.host,
      reason: err.code,
      ...(err.detail ? { detail: err.detail } : {}),
    }),
  );
}

function refusal(
  code: GuardedFetchErrorCode,
  host: string,
  detail: BlockedAddressReason | null = null,
): GuardedFetchError {
  const err = new GuardedFetchError(code, host, detail);
  logRefusal(err);
  return err;
}

function refuse(
  code: GuardedFetchErrorCode,
  host: string,
  detail: BlockedAddressReason | null = null,
): never {
  throw refusal(code, host, detail);
}

/** What `fetch` throws for a failed network request. */
function networkError(cause: unknown): TypeError {
  return new TypeError("fetch failed", { cause });
}

/** The scheme, port and credentials rules, for a URL given or redirected to. */
function checkUrl(url: URL, allowHttp: boolean): void {
  const host = url.hostname;
  if (url.protocol !== "https:" && url.protocol !== "http:")
    refuse("blocked_scheme", host || url.protocol);
  if (url.protocol === "http:" && !allowHttp) refuse("blocked_scheme", host);
  if (url.username || url.password) refuse("blocked_credentials", host);
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!ALLOWED_PORTS.has(port)) refuse("blocked_port", host);
}

/** The checks that need no lookup: an IP literal's address, and names that are never a public site. */
function checkHost(url: URL): void {
  const literal = ipLiteral(url.hostname);
  if (literal) {
    const reason = blockedAddressReason(literal);
    if (reason) refuse("blocked_address", url.hostname, reason);
    return;
  }
  const nameReason = blockedHostnameReason(url.hostname);
  if (nameReason) refuse("blocked_address", url.hostname, nameReason);
}

/**
 * The dispatcher's lookup: the name resolved once, every answer checked, and only checked answers handed to the
 * socket. A name with one private answer is refused, not tried on its public one.
 */
const checkedLookup: LookupFunction = (hostname, options, callback) => {
  const nameReason = blockedHostnameReason(hostname);
  if (nameReason) {
    callback(refusal("blocked_address", hostname, nameReason), "", 0);
    return;
  }
  resolveHost(hostname).then(
    (addresses) => {
      if (addresses.length === 0) {
        callback(
          Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }),
          "",
          0,
        );
        return;
      }
      for (const a of addresses) {
        const reason = blockedAddressReason(a.address);
        if (reason) {
          callback(refusal("blocked_address", hostname, reason), "", 0);
          return;
        }
      }
      if (options.all) callback(null, addresses as LookupAddress[]);
      else callback(null, addresses[0].address, addresses[0].family);
    },
    (err: NodeJS.ErrnoException) => callback(err, "", 0),
  );
};

let pinnedDispatcher: Dispatcher | null = null;

/** One pool for every guarded request (connections are reused per origin, each one opened through the lookup). */
function dispatcher(): Dispatcher {
  pinnedDispatcher ??= createDispatcher(checkedLookup);
  return pinnedDispatcher;
}

/** The refusal a failed fetch carries (from the lookup), else the error itself. */
function unwrap(err: unknown): unknown {
  let cause: unknown = err;
  for (let depth = 0; depth < 4 && cause instanceof Error; depth++) {
    if (cause instanceof GuardedFetchError) return cause;
    cause = cause.cause;
  }
  return err;
}

/** The time limits: the whole exchange, and optionally the headers alone. */
class Deadline {
  private readonly controller = new AbortController();
  private readonly timers: NodeJS.Timeout[] = [];
  readonly signal = this.controller.signal;

  constructor(
    private readonly host: () => string,
    timeoutMs: number,
    callerSignal: AbortSignal | undefined,
  ) {
    this.timers.push(this.timer(timeoutMs));
    if (callerSignal) {
      if (callerSignal.aborted) this.controller.abort(callerSignal.reason);
      else
        callerSignal.addEventListener("abort", () => this.controller.abort(callerSignal.reason), {
          once: true,
        });
    }
  }

  private timer(ms: number): NodeJS.Timeout {
    // Logged only where it stops something a caller is waiting for (guardedFetch's catch, a body being read): a
    // body nobody reads (the CDN probe reads headers only) is closed at the deadline without a refusal logged.
    const t = setTimeout(() => {
      this.controller.abort(new GuardedFetchError("timeout", this.host()));
    }, ms);
    t.unref();
    return t;
  }

  /** Starts an earlier limit (for the headers); returns a function that cancels it. */
  limit(ms: number): () => void {
    const t = this.timer(ms);
    return () => clearTimeout(t);
  }

  /** The promise, or the abort reason if the time runs out first. */
  race<T>(promise: Promise<T>): Promise<T> {
    if (this.signal.aborted) return Promise.reject(this.signal.reason);
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(this.signal.reason);
      this.signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (v) => {
          this.signal.removeEventListener("abort", onAbort);
          resolve(v);
        },
        (e) => {
          this.signal.removeEventListener("abort", onAbort);
          reject(e);
        },
      );
    });
  }

  done(): void {
    for (const t of this.timers) clearTimeout(t);
  }
}

interface Hop {
  method: "GET" | "HEAD" | "POST";
  headers: Record<string, string>;
  body: string | undefined;
}

function isTimeout(err: unknown): err is GuardedFetchError {
  return err instanceof GuardedFetchError && err.code === "timeout";
}

/** Counts the decoded bytes and stops the body at the limit; the time limits end with the body. */
function limitedBody(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  host: string,
  deadline: Deadline,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let seen = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          deadline.done();
          controller.close();
          return;
        }
        seen += value.byteLength;
        if (seen > maxBytes) {
          const err = refusal("too_large", host);
          deadline.done();
          controller.error(err);
          await reader.cancel(err).catch(() => {});
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        deadline.done();
        if (isTimeout(err)) logRefusal(err);
        controller.error(err);
      }
    },
    cancel(reason) {
      deadline.done();
      return reader.cancel(reason);
    },
  });
}

/** The caller's Response: `fetch`'s, with its url and redirected as `fetch` would set them after following. */
function toResponse(
  res: Response,
  body: ReadableStream<Uint8Array> | null,
  url: URL,
  redirected: boolean,
): Response {
  const status = res.status;
  const inRange = status >= 200 && status <= 599;
  const response = new Response(body, {
    status: inRange ? status : 200,
    statusText: res.statusText,
    headers: res.headers,
  });
  Object.defineProperty(response, "url", { value: res.url || url.href });
  Object.defineProperty(response, "redirected", { value: redirected || res.redirected });
  if (!inRange) {
    Object.defineProperty(response, "status", { value: status });
    Object.defineProperty(response, "ok", { value: false });
  }
  return response;
}

/** robots.txt per origin and user agent, for `obeyRobots` (ten minutes, in this process). */
const robotsCache = new Map<string, { text: string | null; disallowAll: boolean; at: number }>();
const ROBOTS_TTL_MS = 10 * 60 * 1000;

function userAgentToken(userAgent: string): string {
  return userAgent.split("/")[0].trim();
}

async function robotsAllow(url: URL, ua: string, deadline: Deadline): Promise<boolean> {
  // The caller's own user agent, asked for robots.txt as it will ask for the page.
  const key = `${url.origin} ${ua}`;
  let entry = robotsCache.get(key);
  if (!entry || Date.now() - entry.at > ROBOTS_TTL_MS) {
    try {
      const res = await deadline.race(
        guardedFetch(`${url.origin}/robots.txt`, {
          headers: { "User-Agent": ua },
          timeoutMs: DEFAULT_TIMEOUT_MS,
          maxBytes: 512 * 1024,
        }),
      );
      // RFC 9309 2.3.1: a 4xx is no rules; a 5xx (or no answer) means assume everything is disallowed.
      if (res.ok) entry = { text: await res.text(), disallowAll: false, at: Date.now() };
      else if (res.status >= 400 && res.status < 500)
        entry = { text: null, disallowAll: false, at: Date.now() };
      else entry = { text: null, disallowAll: true, at: Date.now() };
    } catch (err) {
      if (deadline.signal.aborted) throw err;
      entry = { text: null, disallowAll: true, at: Date.now() };
    }
    if (robotsCache.size > 1000) robotsCache.clear();
    robotsCache.set(key, entry);
  }
  if (entry.disallowAll) return false;
  const path = `${url.pathname}${url.search}`;
  return evaluateRobotsForAgent(entry.text, userAgentToken(ua), path).verdict === "allowed";
}

/** When each host may next be asked, for `perHostIntervalMs`. */
const nextRequestAt = new Map<string, number>();

async function pace(host: string, intervalMs: number, deadline: Deadline): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextRequestAt.get(host) ?? 0);
  nextRequestAt.set(host, at + intervalMs);
  if (nextRequestAt.size > 10_000) nextRequestAt.clear();
  if (at > now) await deadline.race(new Promise((r) => setTimeout(r, at - now)));
}

function parseUrl(input: string | URL): URL {
  try {
    return new URL(input);
  } catch (err) {
    throw new TypeError("Failed to parse URL", { cause: err });
  }
}

/**
 * Fetches a URL a customer supplied, refusing every address that isn't a public website. Use this for every
 * such request (tests/unit/fetch/no-unguarded-fetch.test.ts fails on any other).
 */
export async function guardedFetch(
  input: string | URL,
  options: GuardedFetchOptions = {},
): Promise<Response> {
  let url = parseUrl(input);
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1), HARD_TIMEOUT_MS);
  const maxBytes = Math.min(options.maxBytes ?? HARD_MAX_BYTES, HARD_MAX_BYTES);
  const maxRedirects = Math.min(options.maxRedirects ?? MAX_REDIRECTS, MAX_REDIRECTS);
  const redirectMode = options.redirect ?? "follow";
  const allowHttp = options.allowHttp ?? true;
  const deadline = new Deadline(() => url.hostname, timeoutMs, options.signal);
  const cancelHeadersLimit = options.headersTimeoutMs
    ? deadline.limit(Math.min(options.headersTimeoutMs, timeoutMs))
    : () => {};

  let hop: Hop = {
    method: options.method ?? "GET",
    headers: { ...(options.headers ?? {}) },
    body: options.body,
  };
  const ua = Object.entries(hop.headers).find(([k]) => k.toLowerCase() === "user-agent")?.[1];
  let redirects = 0;

  try {
    for (;;) {
      checkUrl(url, allowHttp);
      checkHost(url);
      if (options.obeyRobots && !(await robotsAllow(url, ua ?? "node", deadline)))
        refuse("blocked_by_robots", url.hostname);
      if (options.perHostIntervalMs) await pace(url.hostname, options.perHostIntervalMs, deadline);

      let res: Response;
      try {
        // The caller's own string on the first hop, as it called fetch before S00B (fetch parses it with the same
        // URL parser as the checks above, so it's the same URL); each redirect's resolved URL after that.
        const target = redirects === 0 && typeof input === "string" ? input : url.href;
        res = await fetch(target, {
          method: hop.method,
          headers: hop.headers,
          ...(hop.body !== undefined ? { body: hop.body } : {}),
          redirect: "manual",
          signal: deadline.signal,
          dispatcher: dispatcher(),
        } as RequestInit);
      } catch (err) {
        if (deadline.signal.aborted) throw deadline.signal.reason;
        throw unwrap(err);
      }
      const status = res.status;
      const location = res.headers.get("location");

      if (REDIRECT_STATUSES.has(status) && location && redirectMode !== "manual") {
        await res.body?.cancel().catch(() => {});
        if (redirectMode === "error") throw networkError(new Error("unexpected redirect"));
        redirects += 1;
        if (redirects > maxRedirects) refuse("too_many_redirects", url.hostname);
        let next: URL;
        try {
          next = new URL(location, url);
        } catch (err) {
          throw networkError(err);
        }
        // Fetch standard 4.4, step 12: a POST after a 301 or 302, and anything but GET/HEAD after a 303, becomes a
        // GET without its body.
        const toGet =
          ((status === 301 || status === 302) && hop.method === "POST") ||
          (status === 303 && hop.method !== "GET" && hop.method !== "HEAD");
        if (toGet) {
          hop = {
            method: "GET",
            headers: Object.fromEntries(
              Object.entries(hop.headers).filter(
                ([k]) => !REQUEST_BODY_HEADERS.includes(k.toLowerCase()),
              ),
            ),
            body: undefined,
          };
        }
        // Step 13: a request's authorization never follows it to another origin.
        if (next.origin !== url.origin) {
          hop = {
            ...hop,
            headers: Object.fromEntries(
              Object.entries(hop.headers).filter(([k]) => k.toLowerCase() !== "authorization"),
            ),
          };
        }
        url = next;
        continue;
      }

      cancelHeadersLimit();
      if (options.allowedContentTypes) {
        const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        if (!options.allowedContentTypes.some((t) => t.toLowerCase() === type)) {
          await res.body?.cancel().catch(() => {});
          refuse("bad_content_type", url.hostname);
        }
      }
      const declared = Number(res.headers.get("content-length") ?? "");
      if (Number.isFinite(declared) && declared > maxBytes) {
        await res.body?.cancel().catch(() => {});
        refuse("too_large", url.hostname);
      }

      if (!res.body || hop.method === "HEAD" || NULL_BODY_STATUSES.has(status)) {
        deadline.done();
        return toResponse(res, null, url, redirects > 0);
      }
      return toResponse(
        res,
        limitedBody(res.body, maxBytes, url.hostname, deadline),
        url,
        redirects > 0,
      );
    }
  } catch (err) {
    deadline.done();
    if (isTimeout(err)) logRefusal(err);
    throw err;
  }
}
