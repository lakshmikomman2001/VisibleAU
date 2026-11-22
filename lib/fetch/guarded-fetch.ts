import http, { type IncomingMessage, type OutgoingHttpHeaders } from "node:http";
import https from "node:https";
import { pipeline, Readable, Transform, type TransformCallback } from "node:stream";
import zlib from "node:zlib";
import { evaluateRobotsForAgent } from "@/lib/robots-txt/evaluate";
import {
  type BlockedAddressReason,
  blockedAddressReason,
  blockedHostnameReason,
  ipLiteral,
} from "./address-policy";
import { connectPinned, type PinnedTarget, type ResolvedAddress, resolveHost } from "./transport";

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
 *   ./transport.ts never resolves again);
 * - every redirect checked again from the start;
 * - a hard overall time limit (HARD_TIMEOUT_MS) and a hard body cap (HARD_MAX_BYTES), whatever the caller asks.
 *
 * Per caller (options), each defaulting to what `fetch` did for the callers that existed before S00B: user agent
 * (`fetch`'s own headers when none is given), timeout, redirect mode and limit, byte limit, allowed content types
 * (none checked), robots.txt (not obeyed), a per-host pace (none), and whether plain `http:` is fetched (yes).
 *
 * It answers like `fetch`: a standard Response once the headers arrive, the body decoded per content-encoding as
 * `fetch` decodes it and read as a stream, the same default request headers, `fetch`'s redirect rules (a POST
 * becomes a GET after a 301/302/303), and a network failure as `TypeError("fetch failed")`. A refusal is a
 * GuardedFetchError with a code, logged with the host and the reason only (no path, no query, no content); a
 * timeout's error is named "TimeoutError", as an aborted `fetch` is, so every caller's existing "timed out" /
 * "no answer" handling (lib/crawler/fetch-outcome.ts) reads it unchanged.
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
  /** Request headers. A "User-Agent" here wins; without one, `fetch`'s own ("node") is sent. */
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

function refuse(
  code: GuardedFetchErrorCode,
  host: string,
  detail: BlockedAddressReason | null = null,
): never {
  const err = new GuardedFetchError(code, host, detail);
  logRefusal(err);
  throw err;
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

/** The addresses this hop may connect to: an IP literal checked as it is, a name resolved once and checked. */
async function checkedAddresses(url: URL, deadline: Deadline): Promise<ResolvedAddress[]> {
  const host = url.hostname;
  const literal = ipLiteral(host);
  if (literal) {
    const reason = blockedAddressReason(literal);
    if (reason) refuse("blocked_address", host, reason);
    return [{ address: literal, family: literal.includes(":") ? 6 : 4 }];
  }
  const nameReason = blockedHostnameReason(host);
  if (nameReason) refuse("blocked_address", host, nameReason);
  let addresses: ResolvedAddress[];
  try {
    addresses = await deadline.race(resolveHost(host));
  } catch (err) {
    if (err instanceof GuardedFetchError) throw err;
    throw networkError(err);
  }
  if (addresses.length === 0) throw networkError(new Error(`no address for ${host}`));
  for (const a of addresses) {
    const reason = blockedAddressReason(a.address);
    // Every address must be public: a name with one private answer is refused, not tried on its public one.
    if (reason) refuse("blocked_address", host, reason);
  }
  return addresses;
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
    const t = setTimeout(() => {
      const err = new GuardedFetchError("timeout", this.host());
      logRefusal(err);
      this.controller.abort(err);
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

/** `fetch`'s default request headers (undici 7), with the caller's own winning, in `fetch`'s order. */
function requestHeaders(
  url: URL,
  own: Record<string, string>,
  body: string | undefined,
): OutgoingHttpHeaders {
  const out: Record<string, string> = {};
  const has = (name: string) => Object.keys(out).some((k) => k.toLowerCase() === name);
  for (const [k, v] of Object.entries(own)) out[k] = v;
  if (body !== undefined && !has("content-type")) out["content-type"] = "text/plain;charset=UTF-8";
  if (body !== undefined) out["content-length"] = String(Buffer.byteLength(body));
  if (!has("accept")) out.accept = "*/*";
  if (!has("accept-language")) out["accept-language"] = "*";
  if (!has("sec-fetch-mode")) out["sec-fetch-mode"] = "cors";
  if (!has("user-agent")) out["user-agent"] = "node";
  if (!has("accept-encoding"))
    out["accept-encoding"] = url.protocol === "https:" ? "br, gzip, deflate" : "gzip, deflate";
  return { connection: "keep-alive", ...out };
}

interface Hop {
  method: "GET" | "HEAD" | "POST";
  headers: Record<string, string>;
  body: string | undefined;
}

/** One request to one checked target; resolves with the response once its headers arrive. */
function requestOnce(
  url: URL,
  hop: Hop,
  target: PinnedTarget,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        protocol: url.protocol,
        hostname: target.hostname,
        port: target.port,
        defaultPort: url.protocol === "https:" ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method: hop.method,
        headers: requestHeaders(url, hop.headers, hop.body),
        createConnection: () => connectPinned(target),
      },
      (res) => {
        signal.removeEventListener("abort", onAbort);
        resolve(res);
      },
    );
    const onAbort = () => req.destroy(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    req.on("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.aborted ? signal.reason : networkError(err));
    });
    if (hop.body !== undefined) req.write(hop.body);
    req.end();
  });
}

/** zlib or raw deflate, decided by the first byte, as undici's createInflate does. */
function createInflate(): Transform {
  let inner: zlib.Inflate | zlib.InflateRaw | null = null;
  const options = { flush: zlib.constants.Z_SYNC_FLUSH, finishFlush: zlib.constants.Z_SYNC_FLUSH };
  return new Transform({
    transform(chunk: Buffer, _enc, callback: TransformCallback) {
      if (!inner) {
        inner =
          (chunk[0] & 0x0f) === 0x08 ? zlib.createInflate(options) : zlib.createInflateRaw(options);
        inner.on("data", (d: Buffer) => this.push(d));
        inner.on("error", (e) => this.destroy(e));
      }
      inner.write(chunk, callback);
    },
    flush(callback: TransformCallback) {
      if (!inner) {
        callback();
        return;
      }
      inner.once("end", () => callback());
      inner.end();
    },
  });
}

/** zstd, which Node 24 has and this @types/node doesn't declare yet (undici decodes it when Node has it). */
const zstd = {
  create: (zlib as unknown as { createZstdDecompress?: (options: object) => Transform })
    .createZstdDecompress,
  constants: zlib.constants as unknown as Record<string, number>,
};

/** The decoders for a content-encoding header, as `fetch` (undici 7) builds them; none for an unknown coding. */
function decodersFor(contentEncoding: string | undefined): Transform[] {
  const codings = contentEncoding ? contentEncoding.toLowerCase().split(",") : [];
  if (codings.length > 5) throw networkError(new Error("too many content-encodings"));
  const decoders: Transform[] = [];
  for (let i = codings.length - 1; i >= 0; i--) {
    const coding = codings[i].trim();
    if (coding === "x-gzip" || coding === "gzip") {
      decoders.push(
        zlib.createGunzip({
          flush: zlib.constants.Z_SYNC_FLUSH,
          finishFlush: zlib.constants.Z_SYNC_FLUSH,
        }),
      );
    } else if (coding === "deflate") {
      decoders.push(createInflate());
    } else if (coding === "br") {
      decoders.push(
        zlib.createBrotliDecompress({
          flush: zlib.constants.BROTLI_OPERATION_FLUSH,
          finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH,
        }),
      );
    } else if (coding === "zstd" && zstd.create) {
      decoders.push(
        zstd.create({
          flush: zstd.constants.ZSTD_e_continue,
          finishFlush: zstd.constants.ZSTD_e_end,
        }),
      );
    } else {
      return [];
    }
  }
  return decoders;
}

/** Counts the decoded bytes and stops the body at the limit. */
function byteLimit(maxBytes: number, host: string): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, callback: TransformCallback) {
      seen += chunk.length;
      if (seen > maxBytes) {
        const err = new GuardedFetchError("too_large", host);
        logRefusal(err);
        callback(err);
        return;
      }
      callback(null, chunk);
    },
  });
}

function responseHeaders(res: IncomingMessage): Headers {
  const headers = new Headers();
  for (let i = 0; i + 1 < res.rawHeaders.length; i += 2) {
    try {
      headers.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
    } catch {
      // A header the Fetch standard can't hold; fetch would have refused the response, a caller never reads it.
    }
  }
  return headers;
}

const REASON_PHRASE = /^[\t\x20-\x7e\x80-\xff]*$/;

/** A standard Response, with what `fetch` sets that the constructor can't (url, redirected, a status like 999). */
function toResponse(
  res: IncomingMessage,
  body: ReadableStream<Uint8Array> | null,
  url: URL,
  redirected: boolean,
): Response {
  const status = res.statusCode ?? 0;
  const inRange = status >= 200 && status <= 599;
  const statusText = res.statusMessage ?? "";
  const response = new Response(body, {
    status: inRange ? status : 200,
    statusText: REASON_PHRASE.test(statusText) ? statusText : "",
    headers: responseHeaders(res),
  });
  Object.defineProperty(response, "url", { value: url.href });
  Object.defineProperty(response, "redirected", { value: redirected });
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
      if (err instanceof GuardedFetchError && err.code === "timeout" && deadline.signal.aborted)
        throw err;
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
  const userAgent =
    Object.entries(hop.headers).find(([k]) => k.toLowerCase() === "user-agent")?.[1] ?? "node";
  let redirects = 0;

  try {
    for (;;) {
      checkUrl(url, allowHttp);
      if (options.obeyRobots && !(await robotsAllow(url, userAgent, deadline)))
        refuse("blocked_by_robots", url.hostname);
      if (options.perHostIntervalMs) await pace(url.hostname, options.perHostIntervalMs, deadline);

      const addresses = await checkedAddresses(url, deadline);
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      const target: PinnedTarget = {
        protocol: url.protocol as "http:" | "https:",
        hostname,
        port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
        addresses,
        sendServerName: ipLiteral(url.hostname) === null,
      };
      const res = await requestOnce(url, hop, target, deadline.signal);
      const status = res.statusCode ?? 0;
      const location = res.headers.location;

      if (REDIRECT_STATUSES.has(status) && location && redirectMode !== "manual") {
        res.destroy();
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
        if (
          ((status === 301 || status === 302) && hop.method === "POST") ||
          (status === 303 && hop.method !== "GET" && hop.method !== "HEAD")
        ) {
          const headers = Object.fromEntries(
            Object.entries(hop.headers).filter(
              ([k]) => !REQUEST_BODY_HEADERS.includes(k.toLowerCase()),
            ),
          );
          hop = { method: "GET", headers, body: undefined };
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
        const type = (res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        if (!options.allowedContentTypes.some((t) => t.toLowerCase() === type)) {
          res.destroy();
          refuse("bad_content_type", url.hostname);
        }
      }
      const declared = Number(res.headers["content-length"] ?? "");
      if (Number.isFinite(declared) && declared > maxBytes) {
        res.destroy();
        refuse("too_large", url.hostname);
      }

      if (hop.method === "HEAD" || NULL_BODY_STATUSES.has(status)) {
        res.resume();
        res.once("end", () => deadline.done());
        return toResponse(res, null, url, redirects > 0);
      }

      const host = url.hostname;
      const limiter = byteLimit(maxBytes, host);
      const stages = [res, ...decodersFor(res.headers["content-encoding"]), limiter] as const;
      const onAbort = () => res.destroy(deadline.signal.reason);
      deadline.signal.addEventListener("abort", onAbort, { once: true });
      pipeline(stages as unknown as [Readable, ...Transform[]], (err) => {
        deadline.signal.removeEventListener("abort", onAbort);
        deadline.done();
        if (err && !limiter.destroyed) limiter.destroy(err);
      });
      const body = Readable.toWeb(limiter) as unknown as ReadableStream<Uint8Array>;
      return toResponse(res, body, url, redirects > 0);
    }
  } catch (err) {
    deadline.done();
    throw err;
  }
}
