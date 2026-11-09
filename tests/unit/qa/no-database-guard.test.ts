/**
 * Regression follow-ups (9 Nov), part 1: a unit test can't reach a database, whatever else is in the run.
 * Before, the integration project's global setup loaded .env.test.local into the shared vitest process and
 * a unit test that forgot to mock a read (signed-in-destination, from cd410f2) passed against a real
 * database whenever an integration file ran alongside it.
 */
import net from "node:net";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import {
  assertNoDatabaseAttempts,
  forgetInheritedDatabaseEnv,
  NO_DATABASE_MESSAGE,
  takeDatabaseAttempts,
} from "../../helpers/no-database-guard";

const THIS_FILE = "tests/unit/qa/no-database-guard.test.ts";

describe("a unit worker's environment", () => {
  it("has no database variables, even when the process it was forked from had them", () => {
    for (const name of [
      "DATABASE_URL",
      "DIRECT_URL",
      "TEST_DATABASE_URL",
      "SERVICE_DATABASE_URL",
      "PGHOST",
    ]) {
      expect(process.env[name], name).toBeUndefined();
    }
  });

  it("forgets every database variable a parent passed down and nothing else", () => {
    const env: Record<string, string | undefined> = {
      DATABASE_URL: "postgres://app:secret@127.0.0.1:5432/visibleau_e2e",
      DIRECT_URL: "postgres://app:secret@127.0.0.1:5432/visibleau_e2e",
      TEST_DATABASE_URL: "postgres://app:secret@127.0.0.1:5432/visibleau_e2e",
      SERVICE_DATABASE_URL: "postgres://svc:secret@127.0.0.1:5433/visibleau_e2e",
      PGPASSWORD: "secret",
      BETTER_AUTH_SECRET: "kept",
      LLM_MODE: "mock",
    };
    expect(forgetInheritedDatabaseEnv(env).sort()).toEqual([
      "DATABASE_URL",
      "DIRECT_URL",
      "PGPASSWORD",
      "SERVICE_DATABASE_URL",
      "TEST_DATABASE_URL",
    ]);
    expect(env).toEqual({ BETTER_AUTH_SECRET: "kept", LLM_MODE: "mock" });
  });
});

describe("a Postgres connection from a unit test", () => {
  it("is refused before it leaves the worker, with an error that says what to do", async () => {
    const sql = postgres("postgres://app:secret@127.0.0.1:5432/visibleau_e2e", {
      max: 1,
      connect_timeout: 5,
    });
    try {
      await expect(sql`select 1`).rejects.toThrow(
        /^Unit tests must mock the database: .+ opened a connection to 127\.0\.0\.1:5432.*vi\.mock, or move the test to tests\/integration\.$/,
      );
    } finally {
      await sql.end({ timeout: 0 });
    }
    const [attempt, ...more] = takeDatabaseAttempts();
    expect(more).toEqual([]);
    expect(attempt).toMatchObject({ host: "127.0.0.1", port: 5432 });
    expect(attempt.test).toBe(
      `${THIS_FILE} > a Postgres connection from a unit test > is refused before it leaves the worker, with an error that says what to do`,
    );
  });

  it("is refused through the app's own client, which a unit-only run builds with no URL (localhost:5432)", async () => {
    const { client } = await import("@/db/client");
    await expect(client`select 1`).rejects.toThrow(NO_DATABASE_MESSAGE);
    expect(takeDatabaseAttempts()).toMatchObject([{ port: 5432 }]);
  });

  it("is refused on a port only an inherited URL named", async () => {
    forgetInheritedDatabaseEnv({
      DATABASE_URL: "postgres://app:secret@127.0.0.1:6001/visibleau_e2e",
    });
    const sql = postgres("postgres://app:secret@127.0.0.1:6001/visibleau_e2e", {
      max: 1,
      connect_timeout: 5,
    });
    try {
      await expect(sql`select 1`).rejects.toThrow(NO_DATABASE_MESSAGE);
    } finally {
      await sql.end({ timeout: 0 });
    }
    expect(takeDatabaseAttempts()).toMatchObject([{ port: 6001 }]);
  });

  it("fails the test it happened in, even when the code under test caught the error", async () => {
    const sql = postgres("postgres://app:secret@127.0.0.1:5432/visibleau_e2e", {
      max: 1,
      connect_timeout: 5,
    });
    const swallowed = await sql`select 1`.then(
      () => "connected",
      () => "caught",
    );
    await sql.end({ timeout: 0 });
    expect(swallowed).toBe("caught");
    // The setup file's afterEach runs this check; called here so this test can see it throw.
    expect(() => assertNoDatabaseAttempts()).toThrow(
      `${NO_DATABASE_MESSAGE}: ${THIS_FILE} > a Postgres connection from a unit test > fails the test it happened in`,
    );
    expect(takeDatabaseAttempts()).toEqual([]);
  });
});

describe("connections that aren't to a database", () => {
  it("go through untouched", async () => {
    const server = net.createServer((socket) => socket.end("hello"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;
    try {
      const reply = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(port, "127.0.0.1");
        let text = "";
        socket.on("data", (chunk) => {
          text += chunk;
        });
        socket.on("end", () => resolve(text));
        socket.on("error", reject);
      });
      expect(reply).toBe("hello");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    expect(takeDatabaseAttempts()).toEqual([]);
  });
});
