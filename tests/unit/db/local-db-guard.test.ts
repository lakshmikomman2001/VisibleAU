import { describe, expect, it } from "vitest";
import { assertLocalSafeDatabaseUrl, UnsafeLocalDatabaseUrlError } from "@/scripts/db/local-db-guard";

describe("assertLocalSafeDatabaseUrl", () => {
  it("allows a plain localhost URL", () => {
    expect(() =>
      assertLocalSafeDatabaseUrl("postgresql://postgres:password@localhost:5432/visibleau"),
    ).not.toThrow();
  });

  it("allows 127.0.0.1", () => {
    expect(() =>
      assertLocalSafeDatabaseUrl("postgresql://postgres:password@127.0.0.1:5432/visibleau_e2e"),
    ).not.toThrow();
  });

  it("allows a local db name that merely contains 'production' as a substring elsewhere -- only the DB name itself is checked", () => {
    // "visibleau" doesn't match /prod/i; this just guards the matcher
    // is scoped to the path (db name), not the whole URL string.
    expect(() =>
      assertLocalSafeDatabaseUrl("postgresql://postgres:password@localhost:5432/visibleau"),
    ).not.toThrow();
  });

  it("rejects a non-local host", () => {
    expect(() =>
      assertLocalSafeDatabaseUrl("postgresql://user:pass@db.some-host.example.com:5432/visibleau"),
    ).toThrow(UnsafeLocalDatabaseUrlError);
  });

  it("rejects any neon.tech URL, even with a safe-looking db name", () => {
    expect(() =>
      assertLocalSafeDatabaseUrl(
        "postgresql://visibleau_app:secret@ep-aged-firefly-a7ujme9z.ap-southeast-2.aws.neon.tech/neondb",
      ),
    ).toThrow(UnsafeLocalDatabaseUrlError);
  });

  it("rejects a localhost URL whose database name is literally visibleau_prod", () => {
    expect(() =>
      assertLocalSafeDatabaseUrl("postgresql://postgres:password@localhost:5432/visibleau_prod"),
    ).toThrow(UnsafeLocalDatabaseUrlError);
  });

  it("rejects case-insensitively (PROD, Production, etc.)", () => {
    expect(() =>
      assertLocalSafeDatabaseUrl("postgresql://postgres:password@localhost:5432/VisibleauPROD"),
    ).toThrow(UnsafeLocalDatabaseUrlError);
    expect(() =>
      assertLocalSafeDatabaseUrl("postgresql://postgres:password@localhost:5432/my_Production_db"),
    ).toThrow(UnsafeLocalDatabaseUrlError);
  });

  it("rejects an unparseable URL", () => {
    expect(() => assertLocalSafeDatabaseUrl("not-a-url-at-all")).toThrow(UnsafeLocalDatabaseUrlError);
  });

  it("never includes the password in the thrown error message", () => {
    try {
      assertLocalSafeDatabaseUrl("postgresql://postgres:super-secret-password@localhost:5432/visibleau_prod");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UnsafeLocalDatabaseUrlError);
      expect((e as Error).message).not.toContain("super-secret-password");
    }
  });
});
