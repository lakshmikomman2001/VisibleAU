import { redactSecrets } from "./redact";

/**
 * URGENT PDF reports (1 Nov), part 0 -- production's PDF upload failed
 * with only "Supabase Storage upload failed: fetch failed". Node's fetch
 * puts the real reason (DNS, connection refused, TLS, a timeout) in
 * err.cause; storage-js wraps that TypeError as StorageUnknownError's
 * `originalError`, and the adapter kept only the outer message. This
 * names the cause (code, name, message with secrets stripped) and the
 * body that was being sent.
 */
export const STORAGE_UPLOAD_FAILED = "Supabase Storage upload failed";

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  cause?: unknown;
  errors?: unknown;
  originalError?: unknown;
  status?: unknown;
}

function asErrorLike(value: unknown): ErrorLike | null {
  return typeof value === "object" && value !== null ? (value as ErrorLike) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** The system error's code: its own, or the first of an AggregateError's (Node's happy-eyeballs connect). */
function codeOf(e: ErrorLike): string | null {
  const own = text(e.code);
  if (own) return own;
  if (Array.isArray(e.errors)) {
    for (const inner of e.errors) {
      const code = text(asErrorLike(inner)?.code);
      if (code) return code;
    }
  }
  return null;
}

/** "ENOTFOUND, Error: getaddrinfo ENOTFOUND <host>" -- null when there's nothing under the outer error. */
export function describeCause(error: unknown): string | null {
  const outer = asErrorLike(error);
  if (!outer) return null;
  // storage-js: StorageUnknownError.originalError is fetch's TypeError("fetch failed"), whose cause is the reason.
  const original = asErrorLike(outer.originalError) ?? outer;
  const cause = asErrorLike(original.cause) ?? (original !== outer ? original : null);
  if (!cause) return null;
  const nameAndMessage = [text(cause.name), text(cause.message)].filter(Boolean).join(": ");
  const parts = [codeOf(cause), nameAndMessage].filter(Boolean);
  return parts.length > 0 ? redactSecrets(parts.join(", ")) : null;
}

/** "48213 bytes, Buffer" -- the size when it's known without reading the body. */
export function describeBody(body: unknown): string {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body))
    return `${body.byteLength} bytes, Buffer`;
  if (body instanceof Uint8Array) return `${body.byteLength} bytes, Uint8Array`;
  if (body instanceof ArrayBuffer) return `${body.byteLength} bytes, ArrayBuffer`;
  if (typeof Blob !== "undefined" && body instanceof Blob) return `${body.size} bytes, Blob`;
  if (typeof body === "string") return `${Buffer.byteLength(body)} bytes, string`;
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    return "size unknown, ReadableStream";
  }
  const pipe = asErrorLike(body) as { pipe?: unknown } | null;
  if (pipe && typeof pipe.pipe === "function") return "size unknown, Node stream";
  return `size unknown, ${body === null ? "null" : typeof body}`;
}

/**
 * The thrown message: "Supabase Storage upload failed: fetch failed (cause:
 * ENOTFOUND, Error: getaddrinfo ENOTFOUND <host>) [body: 48213 bytes,
 * Buffer]", or "...: HTTP 404 Bucket not found [body: ...]" when storage
 * answered. Never a URL, key or token.
 */
export function uploadFailureMessage(error: unknown, body: unknown): string {
  const e = asErrorLike(error);
  const status = typeof e?.status === "number" ? `HTTP ${e.status} ` : "";
  const outer = redactSecrets(text(e?.message) ?? "unknown error");
  const cause = describeCause(error);
  return `${STORAGE_UPLOAD_FAILED}: ${status}${outer}${cause ? ` (cause: ${cause})` : ""} [body: ${describeBody(body)}]`;
}
