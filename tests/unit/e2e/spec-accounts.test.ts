/**
 * Playwright-run follow-ups (9 Nov), part 1. 98 of the 9 Nov run's 133 failures were one cause: the old
 * sprint specs and the root specs seeded "E2E-S5 Org 1" (E2E_TEST_ORG_1_CLERK_ID) and signed in as
 * E2E_TEST_USER_1, whose profile lives in the integration suite's workspace. Each spec now makes its own
 * account and workspace (tests/e2e/helpers/spec-account.ts). And everything that writes checks first that
 * it's the local e2e database: the root specs and the tests/qa helpers connected to whatever
 * DATABASE_URL named, and four folder configs fell back to the dev database.
 *
 * Source scans: `vitest related` never selects these, so they also run in the guard set.
 */
import { describe, expect, it } from "vitest";
import { E2E_SERVER_ENV, e2eWebServer } from "@/tests/e2e/helpers/e2e-config";
import { assertE2eDatabaseUrl } from "@/tests/e2e/helpers/e2e-database";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

readSourcesBeforeAll(["tests/e2e", "tests/qa", "playwright.config.ts"]);

const live = (paths: string[]) =>
  paths.filter((p) => !p.includes("/node_modules/") && !p.startsWith("tests/qa/_archive/"));

describe("each Playwright spec signs in as an account whose workspace it seeds", () => {
  it("no spec under tests/e2e signs in as, or seeds for, the shared E2E_TEST_USER_1/2 accounts", () => {
    const specs = live(sourcePaths(["tests/e2e"], /\.spec\.ts$/));
    expect(specs.length).toBeGreaterThan(15);
    const shared =
      /E2E_TEST_(USER|ORG)_[12]_|E2E_TEST_USER(_2)?_(EMAIL|PASSWORD)|\bensure(Organization|User)\(/;
    expect(specs.filter((p) => shared.test(sourceText(p)))).toEqual([]);
  });

  it("the e2e helpers no longer offer the find-or-keep org and user seeding", () => {
    const helpers = sourceText("tests/e2e/helpers/db.ts") + sourceText("tests/e2e/helpers/auth.ts");
    expect(helpers).not.toMatch(/export async function ensure(Organization|User)\b/);
    expect(helpers).not.toMatch(/signInAsTestUser|\bUSER_[12]\b/);
  });

  it("no spec moves a profile into its workspace: plans and workspaces come from the helper", () => {
    const specs = live(sourcePaths(["tests/e2e"], /\.spec\.ts$/));
    const moves = /\.update\(users\)[\s\S]{0,80}organizationId/;
    expect(specs.filter((p) => moves.test(sourceText(p)))).toEqual([]);
  });
});

describe("everything that connects to a database checks it's the local e2e one first", () => {
  const checked = /\be2eDatabaseUrl\(|\bassertE2eDatabaseUrl\(/;

  it("every tests/e2e file that makes a postgres client", () => {
    const files = live(sourcePaths(["tests/e2e"])).filter((p) =>
      /\bpostgres\(/.test(sourceText(p)),
    );
    expect(files.length).toBeGreaterThan(5);
    expect(files.filter((p) => !checked.test(sourceText(p)))).toEqual([]);
  });

  it("every tests/qa database helper", () => {
    const helpers = live(sourcePaths(["tests/qa"])).filter((p) => /\/shared\/db\.ts$/.test(p));
    expect(helpers.length).toBeGreaterThanOrEqual(8);
    expect(helpers.filter((p) => !checked.test(sourceText(p)))).toEqual([]);
  });

  it.each([
    ["visibleau_prod", "postgresql://u:p@localhost:5432/visibleau_prod"],
    ["the dev database", "postgresql://u:p@localhost:5432/visibleau"],
    ["Neon", "postgresql://u:p@ep-x.ap-southeast-2.aws.neon.tech/visibleau_e2e"],
    ["another host", "postgresql://u:p@db.example.com:5432/visibleau_e2e"],
  ])("refuses %s", (_name, url) => {
    expect(() => assertE2eDatabaseUrl(url, "DATABASE_URL")).toThrow(/Refusing to run/);
  });

  it("accepts only the local e2e database", () => {
    const url = "postgresql://u:p@localhost:5432/visibleau_e2e";
    expect(assertE2eDatabaseUrl(url, "DATABASE_URL")).toBe(url);
    expect(() => assertE2eDatabaseUrl(undefined, "DIRECT_URL")).toThrow(/DIRECT_URL is not set/);
  });
});

describe("every tests/e2e config loads .env.test.local only and starts its server from it", () => {
  const configs = [
    "playwright.config.ts",
    ...sourcePaths(["tests/e2e"], /playwright\.config\.ts$/),
  ];

  it.each(configs)("%s", (path) => {
    const text = sourceText(path);
    expect(text).toMatch(/\bloadE2eEnv\(\);/);
    expect(text).toMatch(/webServer: e2eWebServer\(/);
    // `pnpm dev` / a bare `next dev` here would read .env.local for every variable the test file lacks.
    expect(text).not.toMatch(/pnpm dev|next dev|from "dotenv"/);
  });

  it("the server runs with NODE_ENV=test, so Next reads .env.test.local and never .env.local", () => {
    const server = e2eWebServer();
    expect(server.command).toBe("npx next dev --port 3000");
    expect(server.env.NODE_ENV).toBe("test");
    expect(E2E_SERVER_ENV).toEqual({ NODE_ENV: "test", LLM_MODE: "mock", STORAGE_DRIVER: "local" });
  });

  it("an already-running server is reused only when asked", () => {
    const saved = process.env.E2E_REUSE_SERVER;
    try {
      delete process.env.E2E_REUSE_SERVER;
      expect(e2eWebServer().reuseExistingServer).toBe(false);
      process.env.E2E_REUSE_SERVER = "1";
      expect(e2eWebServer().reuseExistingServer).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.E2E_REUSE_SERVER;
      else process.env.E2E_REUSE_SERVER = saved;
    }
  });
});
