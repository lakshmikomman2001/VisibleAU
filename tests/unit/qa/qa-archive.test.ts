/**
 * Playwright-run follow-ups (9 Nov), part 5 -- Sri's decisions on tests/qa. 23 obsolete specs, sprint1's
 * Stripe-direct f10 and four that passed without testing what their names say went to tests/qa/_archive/,
 * kept but never run (several delete shared rows: sprint10 f10's afterAll deleted every audit and brand in the
 * shared __sample__ org). sprint9's 13 vitest files moved into the suites or the archive. The .bat/.sh wrappers
 * that ran `pnpm dev` in the main tree (it reads .env.local) are gone, and every QA config starts its own server
 * from .env.test.local.
 */
import { describe, expect, it } from "vitest";
import {
  listFiles,
  readSourcesBeforeAll,
  sourcePaths,
  sourceText,
} from "@/tests/helpers/source-files";

readSourcesBeforeAll(
  ["tests/qa", "tests/e2e", "playwright.config.ts", "vitest.config.ts"],
  /\.(ts|md)$/,
);

const ARCHIVE = "tests/qa/_archive/";
const live = (p: string) => !p.startsWith(ARCHIVE) && !p.includes("/node_modules/");

describe("the archive", () => {
  const archived = () =>
    sourcePaths(["tests/qa/_archive"], /\.(spec|test)\.ts$/).map((p) => p.slice(ARCHIVE.length));

  it("holds the 28 retired Playwright specs and sprint9's 9 archived vitest files", () => {
    expect(archived()).toHaveLength(37);
  });

  it("names every file it holds, with its reason, in its README", () => {
    const readme = sourceText(`${ARCHIVE}README.md`);
    const unlisted = archived().filter((p) => {
      const name =
        p
          .split("/")
          .at(-1)
          ?.replace(/\.(spec|test)\.ts$/, "") ?? p;
      return !readme.includes(`\`${p.split("/")[0]}/${name}\``) && !readme.includes(`\`${name}\``);
    });
    expect(unlisted).toEqual([]);
  });

  it("nothing came back unrewritten: no archived spec is at its old path again", () => {
    const old = new Set(archived().map((p) => `tests/qa/${p}`));
    const back = sourcePaths(["tests/qa"], /\.(spec|test)\.ts$/).filter((p) => old.has(p));
    expect(back).toEqual([]);
  });

  it("no Playwright or vitest config reaches it", () => {
    const configs = [
      "playwright.config.ts",
      "vitest.config.ts",
      ...sourcePaths(["tests/qa", "tests/e2e"], /(playwright|vitest)\.config\.ts$/).filter(live),
    ];
    for (const path of configs)
      expect(sourceText(path), path).not.toMatch(/_archive|tests\/qa\/\*\*/);
    // The QA configs each test only their own folder, and the archive is no sprint's folder.
    for (const path of configs.filter((p) => p.startsWith("tests/qa/"))) {
      expect(sourceText(path), path).toMatch(/testDir: "\."|root: __dirname/);
    }
    const root = sourceText("vitest.config.ts");
    expect(root).not.toMatch(/["']tests\/qa/);
  });
});

describe("the QA configs", () => {
  it("no .bat, .sh or .cmd wrapper is left", () => {
    expect(
      listFiles(["tests/qa"])
        .filter(live)
        .filter((p) => /\.(bat|sh|cmd)$/.test(p)),
    ).toEqual([]);
  });

  it.each(
    [
      "sprint1",
      "sprint2",
      "sprint3",
      "sprint4",
      "sprint5",
      "sprint6",
      "sprint9",
      "sprint10",
      "sprint11",
    ].map((s) => `tests/qa/${s}/playwright.config.ts`),
  )("%s loads .env.test.local only and starts its own server from it", (path) => {
    const code = sourceText(path)
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/\bloadE2eEnv\(\);/);
    expect(code).toMatch(/webServer: e2eWebServer\(/);
    expect(code).not.toMatch(/from "dotenv"|pnpm dev|CLERK_/);
  });

  it("the README gives one command for each", () => {
    const readme = sourceText("tests/qa/README.md");
    for (const path of sourcePaths(["tests/qa"], /(playwright|vitest)\.config\.ts$/).filter(live)) {
      expect(readme, path).toContain(`--config ${path}`);
    }
  });

  it("every live QA file that makes a database client checks it's the local e2e database first", () => {
    const files = sourcePaths(["tests/qa"])
      .filter(live)
      .filter((p) => /\bpostgres\(/.test(sourceText(p)));
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((p) => !/\bassertE2eDatabaseUrl\(/.test(sourceText(p)))).toEqual([]);
  });
});
