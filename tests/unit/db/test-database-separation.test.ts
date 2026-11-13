/**
 * 13 Nov, part 6 -- the integration tests' own database. In the last run a phase2 sprint4 test's truncateAll()
 * emptied organizations, users and the vertical packs in visibleau_e2e, which Playwright also uses: user 1 lost
 * their membership and all 336 pack prompts went, so Playwright specs failed on database state. Now:
 * - the "integration" vitest project's database variables are all visibleau_integration (vitest.config.ts, from
 *   tests/helpers/integration-database.ts), from .env.test.local's TEST_DATABASE_URL on the same local server;
 * - tests/integration/global-setup.ts and the sprint4 helper refuse any other database;
 * - Playwright's helpers still refuse anything but visibleau_e2e.
 * No database is reached here (unit project); the proof against the real databases is in the part 6 report.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertE2eDatabaseUrl, assertSeedDatabaseUrl } from "../../e2e/helpers/e2e-database";
import {
  assertIntegrationDatabaseUrl,
  INTEGRATION_DATABASE,
  INTEGRATION_DATABASE_VARIABLES,
  integrationDatabaseUrl,
  integrationEnv,
  integrationProjectEnv,
} from "../../helpers/integration-database";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "../../helpers/source-files";

const E2E = "postgresql://postgres:secret@localhost:5432/visibleau_e2e";
const INTEGRATION = "postgresql://postgres:secret@localhost:5432/visibleau_integration";

readSourcesBeforeAll(["tests/integration", "tests/phase2", "tests/helpers"]);

/** Code without comments: what could open a connection. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("the integration database's URL", () => {
  it("is .env.test.local's TEST_DATABASE_URL on the same server, with its own name", () => {
    expect(INTEGRATION_DATABASE).toBe("visibleau_integration");
    expect(integrationDatabaseUrl({ TEST_DATABASE_URL: E2E })).toBe(INTEGRATION);
    expect(
      integrationDatabaseUrl({
        TEST_DATABASE_URL: "postgresql://app:pw@127.0.0.1:6543/visibleau_e2e?sslmode=disable",
      }),
    ).toBe("postgresql://app:pw@127.0.0.1:6543/visibleau_integration?sslmode=disable");
  });

  it("an explicit INTEGRATION_DATABASE_URL wins, if it names the integration database", () => {
    const own = "postgresql://postgres:pw@localhost:5433/visibleau_integration";
    expect(integrationDatabaseUrl({ INTEGRATION_DATABASE_URL: own, TEST_DATABASE_URL: E2E })).toBe(
      own,
    );
    expect(() => integrationDatabaseUrl({ INTEGRATION_DATABASE_URL: E2E })).toThrow(
      /visibleau_e2e is Playwright's/,
    );
  });

  it("every database variable the app and tests read is the integration database", () => {
    expect(integrationEnv({ TEST_DATABASE_URL: E2E })).toEqual({
      DATABASE_URL: INTEGRATION,
      DIRECT_URL: INTEGRATION,
      TEST_DATABASE_URL: INTEGRATION,
      SERVICE_DATABASE_URL: INTEGRATION,
    });
  });

  it("refuses Playwright's database, anything named like prod, and any other host", () => {
    expect(() => assertIntegrationDatabaseUrl(E2E)).toThrow(
      /integration tests use only visibleau_integration/,
    );
    expect(() =>
      integrationDatabaseUrl({
        TEST_DATABASE_URL: "postgresql://u:p@localhost:5432/visibleau_prod",
      }),
    ).toThrow(/prod/);
    expect(() =>
      integrationDatabaseUrl({
        TEST_DATABASE_URL: "postgresql://u:p@db.example.com:5432/visibleau_e2e",
      }),
    ).toThrow(/not localhost/);
    expect(() => integrationDatabaseUrl({})).toThrow(/TEST_DATABASE_URL is not set/);
  });

  it("and Playwright's guard still refuses the integration database", () => {
    expect(() => assertE2eDatabaseUrl(INTEGRATION)).toThrow(/only to visibleau_e2e/);
  });

  it("the e2e seed helpers write to the test database they're given: Playwright's, or the integration tests' own", () => {
    expect(assertSeedDatabaseUrl(E2E)).toBe(E2E);
    expect(assertSeedDatabaseUrl(INTEGRATION)).toBe(INTEGRATION);
    for (const other of [
      "postgresql://u:p@localhost:5432/visibleau",
      "postgresql://u:p@localhost:5432/visibleau_prod",
      "postgresql://u:p@db.example.com:5432/visibleau_e2e",
    ]) {
      expect(() => assertSeedDatabaseUrl(other)).toThrow(/Refusing to run/);
    }
  });
});

describe("the integration project's env (vitest.config.ts)", () => {
  const dir = mkdtempSync(join(tmpdir(), "integration-env-"));

  it("from an env file naming visibleau_e2e: every variable is visibleau_integration", () => {
    const file = join(dir, ".env.test.local");
    writeFileSync(file, `DATABASE_URL=${E2E}\nDIRECT_URL=${E2E}\nTEST_DATABASE_URL=${E2E}\n`);
    const env = integrationProjectEnv(file, {});
    expect(Object.values(env)).toEqual([INTEGRATION, INTEGRATION, INTEGRATION, INTEGRATION]);
    expect(JSON.stringify(env)).not.toContain("visibleau_e2e");
  });

  it("vitest.config.ts gives the integration project exactly those variables", async () => {
    const { default: config } = await import("../../../vitest.config");
    const projects =
      (config as unknown as { test?: { projects?: unknown[] } }).test?.projects ?? [];
    const integration = projects
      .map((p) => p as { test?: { name?: string; env?: Record<string, string> } })
      .find((p) => p.test?.name === "integration");
    const env = integration?.test?.env ?? {};
    expect(Object.keys(env).sort()).toEqual([...INTEGRATION_DATABASE_VARIABLES].sort());
    for (const value of Object.values(env)) {
      if (value !== "") expect(new URL(value).pathname).toBe(`/${INTEGRATION_DATABASE}`);
    }
    expect(JSON.stringify(env)).not.toContain("visibleau_e2e");
  }, 30_000);

  it("no env file: every variable is empty, never a fallback to the e2e database", () => {
    const env = integrationProjectEnv(join(dir, "missing.env"), {});
    expect(Object.values(env)).toEqual(["", "", "", ""]);
  });

  it("the sprint4 helper that truncates, and the bootstrap, refuse anything but the integration database", () => {
    expect(sourceText("tests/phase2/sprint4/helpers/test-db.ts")).toMatch(
      /postgres\(assertIntegrationDatabaseUrl\(process\.env\.DATABASE_URL\)/,
    );
    expect(sourceText("tests/integration/global-setup.ts")).toMatch(
      /assertIntegrationDatabaseUrl\(process\.env\.DATABASE_URL\)/,
    );
  });

  // Part 6 follow-up: the env can't redirect a connection string written into a file. The only integration
  // files that name Playwright's database do so to check a guard refuses or accepts it, never to connect.
  it("no integration test or helper hardcodes a connection to Playwright's database", () => {
    const files = sourcePaths(["tests/integration", "tests/phase2", "tests/helpers"]);
    expect(files.length).toBeGreaterThan(300);
    const naming = files.filter((path) => /\/visibleau_e2e\b/.test(codeOf(sourceText(path))));
    expect(naming.sort()).toEqual([
      "tests/integration/e2e-agency-user-seed.integration.test.ts",
      "tests/integration/e2e-spec-account.integration.test.ts",
    ]);
    for (const path of naming) {
      const code = codeOf(sourceText(path));
      expect(code, path).not.toMatch(/postgres\(\s*(["'`][^"'`]*visibleau_e2e|LOCAL_E2E)/);
      expect(code, path).not.toMatch(/process\.env\.\w+\s*=\s*["'`][^"'`]*visibleau_e2e/);
    }
  });
});
