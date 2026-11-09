/**
 * Unit tests must never reach a database (regression follow-ups, 9 Nov, part 1).
 *
 * How one did: `tests/integration/global-setup.ts` loads `.env.test.local` into the main vitest process
 * when its module loads, and every forked worker inherits that environment -- the "unit" project's too. So a
 * unit test that forgot to mock a database read passed whenever an integration file was in the same run
 * (every `vitest related` run that picked one), and failed alone. `signed-in-destination` did exactly that
 * from cd410f2 until the 8 Nov nightly ran the unit suite on its own.
 *
 * Two parts, both installed in every "unit" worker by `tests/unit/no-database.setup.ts`:
 * - `forgetInheritedDatabaseEnv()` deletes the database variables, so a unit test sees the same environment
 *   whether or not an integration file ran first. On its own that isn't enough: postgres.js with no URL
 *   falls back to localhost:5432 as the OS user and still reaches the local server (the nightly's
 *   "password authentication failed for user srini").
 * - `installNoDatabaseGuard()` refuses every Postgres connection at the socket, before any network traffic,
 *   whatever URL a module built it from. postgres.js hands the socket's error to the waiting query, so the
 *   code under test sees a clear error; and the attempt is recorded, so `assertNoDatabaseAttempts()` fails
 *   the test even when the code under test catches that error.
 */
import net from "node:net";

export const NO_DATABASE_MESSAGE = "Unit tests must mock the database";

/** Postgres's default port and the transaction pooler's (Supabase, PgBouncer). */
const POSTGRES_PORTS = [5432, 6543];

const DATABASE_ENV_NAME =
  /DATABASE_URL|^DIRECT_URL$|^POSTGRES_URL|^PG(HOST|HOSTADDR|PORT|USER|PASSWORD|DATABASE)$/;

export interface DatabaseAttempt {
  /** Repo-relative test file, and the test running when the connection was opened (if any). */
  test: string;
  /** The first repo file on the connecting call stack outside node_modules and this guard, when V8 kept one. */
  from: string | null;
  host: string;
  port: number;
}

interface GuardState {
  installed: boolean;
  ports: Set<number>;
  attempts: DatabaseAttempt[];
  describeTest: () => string;
}

const STATE_KEY = Symbol.for("visibleau.tests.noDatabaseGuard");
type GlobalWithGuard = typeof globalThis & { [STATE_KEY]?: GuardState };

function state(): GuardState {
  const g = globalThis as GlobalWithGuard;
  g[STATE_KEY] ??= {
    installed: false,
    ports: new Set(POSTGRES_PORTS),
    attempts: [],
    describeTest: () => "?",
  };
  return g[STATE_KEY];
}

function portOf(value: string | undefined): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  try {
    const port = new URL(value).port;
    return port ? Number(port) : null;
  } catch {
    return null;
  }
}

/**
 * Deletes every database variable from this worker's environment and returns their names (never values).
 * The ports they named are guarded too, so a server on a non-default port is still refused.
 */
export function forgetInheritedDatabaseEnv(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const names = Object.keys(env).filter((name) => DATABASE_ENV_NAME.test(name));
  for (const name of names) {
    const port = portOf(env[name]);
    if (port !== null && (name.endsWith("URL") || name === "PGPORT")) state().ports.add(port);
    delete env[name];
  }
  return names;
}

const SOURCE_FILE = /^([^():]+?\.(?:ts|tsx|js|mjs))/;

function callerFile(stack: string | undefined): string | null {
  const root = `${process.cwd().replace(/\\/g, "/").toLowerCase()}/`;
  for (const raw of (stack ?? "").split("\n").slice(1)) {
    const line = raw.replace(/\\/g, "/");
    const at = line.toLowerCase().indexOf(root);
    if (at === -1) continue;
    const m = SOURCE_FILE.exec(line.slice(at + root.length));
    if (m && !m[1].startsWith("node_modules/") && !m[1].includes("no-database")) return m[1];
  }
  return null;
}

/** [port, host] from the forms net.Socket#connect takes: (options), (port[, host]) and (path) for IPC. */
function target(args: unknown[]): { port: number; host: string } | null {
  const [first, second] = args;
  if (first && typeof first === "object") {
    const opts = first as { port?: number | string; host?: string; path?: string };
    if (opts.path !== undefined || opts.port === undefined) return null;
    return { port: Number(opts.port), host: opts.host ?? "localhost" };
  }
  if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) {
    return { port: Number(first), host: typeof second === "string" ? second : "localhost" };
  }
  return null;
}

/**
 * Patches net.Socket#connect in this worker so a connection to a Postgres port never leaves it. Safe to call
 * more than once. `describeTest` names the running test for the error and the record.
 */
export function installNoDatabaseGuard(describeTest: () => string): void {
  const s = state();
  s.describeTest = describeTest;
  if (s.installed) return;
  s.installed = true;

  const realConnect = net.Socket.prototype.connect;
  // net.Socket#connect is overloaded; the guard forwards whatever it was given, untouched.
  function guardedConnect(this: net.Socket, ...args: unknown[]): net.Socket {
    const to = target(args);
    if (!to || !s.ports.has(to.port)) return Reflect.apply(realConnect, this, args) as net.Socket;
    const attempt: DatabaseAttempt = {
      test: s.describeTest(),
      from: callerFile(new Error().stack),
      host: to.host,
      port: to.port,
    };
    s.attempts.push(attempt);
    const error = new Error(describeAttempt(attempt));
    process.nextTick(() => this.destroy(error));
    return this;
  }
  net.Socket.prototype.connect = guardedConnect as unknown as typeof realConnect;
}

export function describeAttempt(a: DatabaseAttempt): string {
  return (
    `${NO_DATABASE_MESSAGE}: ${a.from ?? a.test} opened a connection to ${a.host}:${a.port}` +
    `${a.from ? ` (in ${a.test})` : ""}. Mock the module that queries it with vi.mock, or move the test to ` +
    "tests/integration."
  );
}

/** The connections refused since the last call, cleared. */
export function takeDatabaseAttempts(): DatabaseAttempt[] {
  return state().attempts.splice(0);
}

/** Throws (failing the test it runs after) if anything tried to connect to a database since the last check. */
export function assertNoDatabaseAttempts(): void {
  const attempts = takeDatabaseAttempts();
  if (attempts.length === 0) return;
  throw new Error(attempts.map(describeAttempt).join("\n"));
}
