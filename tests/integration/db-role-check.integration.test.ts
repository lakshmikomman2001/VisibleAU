/**
 * Task #46 (13th follow-up): the prepush bundle's RLS role row can only ever
 * see whoever runs the bundle itself (the Neon editor's owner role), never
 * what Vercel's DATABASE_URL or Inngest's SERVICE_DATABASE_URL actually
 * connect as. checkDbRole()/logDbRoleCheck() are the app-side answer --
 * proved here against real Postgres, as both a restricted role
 * (visibleau_app, this project's own existing non-superuser role from
 * scripts/db/tier1a-app-role.sql) and a superuser.
 */
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkDbRole, logDbRoleCheck } from "@/lib/db/role-check";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

function asRole(role: string, password: string): string {
  const url = new URL(getTestDatabaseUrl());
  url.username = role;
  url.password = password;
  return url.toString();
}

describe("checkDbRole()/logDbRoleCheck() against real Postgres", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("as visibleau_app (restricted role): super=false, bypassrls=false, no error log", async () => {
    const client = postgres(asRole("visibleau_app", "visibleau_app_dev"), { max: 1 });
    try {
      const result = await checkDbRole(client);
      expect(result.role).toBe("visibleau_app");
      expect(result.super).toBe(false);
      expect(result.bypassrls).toBe(false);

      await logDbRoleCheck(client, { connection: "app", expectedPrivileged: false });
      expect(errorSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(logged.event).toBe("db_role_check");
      expect(logged.super).toBe(false);
      expect(logged.bypassrls).toBe(false);
    } finally {
      await client.end();
    }
  });

  it("as a superuser connected to the 'app' slot: error-logged, does not throw", async () => {
    const client = postgres(asRole("postgres", "password"), { max: 1 });
    try {
      const result = await checkDbRole(client);
      expect(result.super).toBe(true);

      const returned = await logDbRoleCheck(client, { connection: "app", expectedPrivileged: false });
      expect(returned).not.toBeNull();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
      const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(logged.event).toBe("db_role_check");
      expect(logged.connection).toBe("app");
      expect(logged.super).toBe(true);
    } finally {
      await client.end();
    }
  });

  it("as a superuser connected to the 'service' slot (expectedPrivileged=true): no error, privilege is expected", async () => {
    const client = postgres(asRole("postgres", "password"), { max: 1 });
    try {
      await logDbRoleCheck(client, { connection: "service", expectedPrivileged: true });
      expect(errorSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledTimes(1);
    } finally {
      await client.end();
    }
  });

  it("as visibleau_app connected to the 'service' slot (expectedPrivileged=true but isn't): error-logged", async () => {
    const client = postgres(asRole("visibleau_app", "visibleau_app_dev"), { max: 1 });
    try {
      await logDbRoleCheck(client, { connection: "service", expectedPrivileged: true });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      await client.end();
    }
  });

  it("never throws even if the query itself fails (e.g. bad connection)", async () => {
    const bogusUrl = new URL(getTestDatabaseUrl());
    bogusUrl.port = "1";
    const client = postgres(bogusUrl.toString(), { max: 1, connect_timeout: 1 });
    try {
      const result = await logDbRoleCheck(client, { connection: "app", expectedPrivileged: false });
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      await client.end({ timeout: 1 }).catch(() => {});
    }
  });
});
