/**
 * URGENT PDF reports (1 Nov), part 0 -- what's wrong with the storage env
 * vars, without ever printing their values. On 27 Oct a Vercel variable
 * was found holding the wrong value (an API key saved as the Resend from
 * address); a wrong SUPABASE_URL fails every upload with only "fetch
 * failed", three attempts and about two minutes later. render-report-pdf
 * runs this first and stops at once on a problem.
 *
 * Problems make uploads fail. Warnings are harmless today -- supabase-js
 * trims the URL and adds the trailing slash itself -- but are a sign of a
 * hand-pasted value.
 */
/** The env vars it reads -- process.env, or a plain object in tests. */
export type StorageEnv = Readonly<Record<string, string | undefined>>;

export interface StorageConfigCheck {
  problems: string[];
  warnings: string[];
}

/** A Supabase project URL is https://<project-ref>.supabase.co and nothing more. */
const SUPABASE_HOST = /^[a-z0-9]+\.supabase\.co$/;
/** Supabase's legacy anon / service-role keys are JWTs. */
const JWT_SHAPE = /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function jwtClaims(token: string): { role?: unknown; ref?: unknown; exp?: unknown } | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload === "object" && payload !== null ? payload : null;
  } catch {
    return null;
  }
}

function checkUrl(raw: string | undefined, out: StorageConfigCheck): string | null {
  if (raw === undefined || raw.trim() === "") {
    out.problems.push("storage URL missing (SUPABASE_URL)");
    return null;
  }
  const value = raw.trim();
  if (value !== raw) out.warnings.push("storage URL has whitespace around it (SUPABASE_URL)");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    out.problems.push("storage URL is not an https://*.supabase.co URL (SUPABASE_URL)");
    return null;
  }
  if (url.protocol !== "https:" || !SUPABASE_HOST.test(url.hostname)) {
    out.problems.push("storage URL is not an https://*.supabase.co URL (SUPABASE_URL)");
    return null;
  }
  if (url.pathname !== "/") {
    out.problems.push(
      "storage URL has a path; it must be just https://<project-ref>.supabase.co (SUPABASE_URL)",
    );
  } else if (value.endsWith("/")) {
    out.warnings.push("storage URL has a trailing slash (SUPABASE_URL)");
  }
  if (url.search || url.hash || url.username || url.password || url.port) {
    out.problems.push("storage URL has a query, port or credentials in it (SUPABASE_URL)");
  }
  return url.hostname.split(".")[0];
}

function checkKey(raw: string | undefined, projectRef: string | null, out: StorageConfigCheck) {
  if (raw === undefined || raw.trim() === "") {
    out.problems.push("storage key missing (SUPABASE_SERVICE_ROLE_KEY)");
    return;
  }
  const value = raw.trim();
  if (value !== raw)
    out.warnings.push("storage key has whitespace around it (SUPABASE_SERVICE_ROLE_KEY)");
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(value)) return;
  if (/^sb_publishable_/.test(value)) {
    out.problems.push(
      "storage key is a publishable key, not the secret (service role) key (SUPABASE_SERVICE_ROLE_KEY)",
    );
    return;
  }
  const claims = JWT_SHAPE.test(value) ? jwtClaims(value) : null;
  if (!claims) {
    out.problems.push(
      "storage key doesn't look like a Supabase key (wrong shape) (SUPABASE_SERVICE_ROLE_KEY)",
    );
    return;
  }
  if (claims.role !== "service_role") {
    out.problems.push("storage key isn't a service-role key (SUPABASE_SERVICE_ROLE_KEY)");
  }
  if (typeof claims.ref === "string" && projectRef !== null && claims.ref !== projectRef) {
    out.problems.push(
      "storage key belongs to a different Supabase project than the storage URL (SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) {
    out.problems.push("storage key has expired (SUPABASE_SERVICE_ROLE_KEY)");
  }
}

export function checkStorageConfig(env: StorageEnv = process.env): StorageConfigCheck {
  const out: StorageConfigCheck = { problems: [], warnings: [] };
  const driver = (env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (driver === "local") {
    // lib/storage/local-adapter.ts writes under the app's own folder, which
    // a Vercel function can't keep.
    if (env.VERCEL === "1") {
      out.problems.push("STORAGE_DRIVER is local, but files written on Vercel aren't kept");
    }
    return out;
  }
  if (driver !== "supabase") {
    out.problems.push('STORAGE_DRIVER is neither "local" nor "supabase"');
    return out;
  }
  const projectRef = checkUrl(env.SUPABASE_URL, out);
  checkKey(env.SUPABASE_SERVICE_ROLE_KEY, projectRef, out);
  return out;
}

export const STORAGE_MISCONFIGURED = "Storage is misconfigured";

/** "Storage is misconfigured: storage URL missing (SUPABASE_URL)" -- null when there's no problem. */
export function storageConfigProblem(env: StorageEnv = process.env): string | null {
  const { problems } = checkStorageConfig(env);
  return problems.length > 0 ? `${STORAGE_MISCONFIGURED}: ${problems.join("; ")}` : null;
}
