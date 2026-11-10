/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 1 -- no page fails silently. The one way a client page
 * fetches what it shows, and the one way it reads a refusal's reason. Pages used to `if (!res.ok) return;`,
 * `.catch(() => {})` or read a failed answer's body as data, and then showed an empty list, "no brands" or
 * a form's defaults as if they were the truth. A failed fetch here throws, so the page (through useLoad,
 * lib/hooks/use-load.ts) says it couldn't load, with Try again.
 */

/** A fetch that failed: the network, an answer that isn't 2xx, or a body that isn't JSON. */
export class LoadFailure extends Error {
  /** The HTTP status, or null when no answer came. */
  readonly status: number | null;
  /** The server's own reason, in its words ("Only owners and admins can ..."), or null. */
  readonly detail: string | null;

  constructor(status: number | null, detail: string | null) {
    super(detail ?? (status === null ? "No answer from the server" : `HTTP ${status}`));
    this.name = "LoadFailure";
    this.status = status;
    this.detail = detail;
  }
}

/** A code such as "brand_needs_confirmation" is for programs, not people. */
const MACHINE_CODE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

function readableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text === "" || MACHINE_CODE.test(text)) return null;
  return text;
}

/**
 * A failed answer's reason, in the server's words: its `message`, else its `error` when that's a sentence
 * rather than a code. Null when it gave neither (or no JSON). Reads the body, so call it once, on a
 * response nothing else reads.
 */
export async function apiMessage(res: Response): Promise<string | null> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const fields = body as Record<string, unknown>;
  return readableText(fields.message) ?? readableText(fields.error);
}

/** Nothing for a 2xx answer; a LoadFailure (with the server's reason) for anything else. */
export async function failUnlessOk(res: Response): Promise<void> {
  if (!res.ok) throw new LoadFailure(res.status, await apiMessage(res));
}

/** The body of a 2xx answer; a LoadFailure for anything else. */
export async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new LoadFailure(res.status, await apiMessage(res));
  try {
    return (await res.json()) as T;
  } catch {
    throw new LoadFailure(res.status, null);
  }
}

/** fetch(), with a network failure as a LoadFailure. An abort is rethrown as itself. */
export async function fetchOrFail(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new LoadFailure(null, null);
  }
}

/** GET (or `init`) a URL and read its JSON; any failure throws a LoadFailure. */
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  return readJson<T>(await fetchOrFail(input, init));
}

/** What a page says when something it asked the server to do was refused or failed. */
export async function actionFailureMessage(res: Response, fallback: string): Promise<string> {
  return (await apiMessage(res)) ?? fallback;
}

/** The one sentence a failed load starts with: "Couldn't load your team." */
export function loadFailedMessage(what: string): string {
  return `Couldn't load ${what}.`;
}
