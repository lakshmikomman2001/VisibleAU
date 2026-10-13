/**
 * Task #46 (7th follow-up): the one shared guard every script or test
 * that's allowed to run DDL/seed/teardown against a "local" database
 * must call first. Five pre-existing test files hardcoded a connection
 * string to a database literally named `visibleau_prod` -- the exact
 * name CLAUDE.md restricts -- and nothing stopped them. This refuses
 * to proceed against anything that isn't unambiguously a disposable
 * local database: a non-localhost host, a database name matching
 * /prod/i, or any URL touching neon.tech (the real production host).
 * See docs/ops/post-launch-db-hardening.md section 46 (7th follow-up).
 */
export class UnsafeLocalDatabaseUrlError extends Error {}

export function assertLocalSafeDatabaseUrl(rawUrl: string): void {
  if (/neon\.tech/i.test(rawUrl)) {
    throw new UnsafeLocalDatabaseUrlError(
      `Refusing to run: this URL touches neon.tech (the real production host). URL: ${redact(rawUrl)}`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeLocalDatabaseUrlError(`Refusing to run: not a valid connection URL: ${redact(rawUrl)}`);
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new UnsafeLocalDatabaseUrlError(
      `Refusing to run: host "${host}" is not localhost/127.0.0.1. URL: ${redact(rawUrl)}`,
    );
  }

  const dbName = parsed.pathname.replace(/^\//, "");
  if (/prod/i.test(dbName)) {
    throw new UnsafeLocalDatabaseUrlError(
      `Refusing to run: database name "${dbName}" matches /prod/i. URL: ${redact(rawUrl)}`,
    );
  }
}

function redact(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.password = "***";
    return u.toString();
  } catch {
    return "(unparseable URL)";
  }
}
