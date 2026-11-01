import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * URGENT PDF reports (1 Nov), part 2 -- every request to Supabase (the PDF
 * upload, a signed download link) gives up after this long. There was no
 * limit of our own: Node's fetch waits up to 10 s to connect and then up
 * to 300 s for the response headers, so a host that accepted the
 * connection and never answered could hold each of render-report-pdf's
 * three attempts for up to 5 minutes (or until the function's own time
 * limit). A timeout is a storage_unavailable failure, and the step's
 * retries are unchanged.
 */
export const SUPABASE_REQUEST_TIMEOUT_MS = 30_000;

/** fetch, aborted after SUPABASE_REQUEST_TIMEOUT_MS (or by the caller's own signal). */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const timeout = new AbortController();
  const timer = setTimeout(
    () =>
      timeout.abort(
        new DOMException(
          `The storage request took longer than ${SUPABASE_REQUEST_TIMEOUT_MS / 1000} s`,
          "TimeoutError",
        ),
      ),
    SUPABASE_REQUEST_TIMEOUT_MS,
  );
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout.signal]) : timeout.signal;
  try {
    return await globalThis.fetch(input, { ...init, signal });
  } finally {
    clearTimeout(timer);
  }
}

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: fetchWithTimeout },
  });

  return _client;
}
