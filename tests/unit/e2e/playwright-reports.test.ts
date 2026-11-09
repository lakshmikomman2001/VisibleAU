/**
 * Playwright-run follow-ups (9 Nov), part 6 -- Playwright's JSON and HTML reports serialise the config, and
 * the configs handed their web server `{ ...process.env, ... }`: the 9 Nov run's 18 JSON reports held the test
 * auth secret, the test-mode Stripe keys and the local Upstash token (redacted by hand, 166 values in 80 files).
 * Playwright already starts the server with the runner's environment ({ ...process.env, ...webServer.env }), so
 * a config passes only the few non-secret values it changes, and no config sets a top-level `env` either.
 * And everything a run writes stays out of git.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { E2E_SERVER_ENV, e2eWebServer } from "@/tests/e2e/helpers/e2e-config";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

readSourcesBeforeAll(["playwright.config.ts", "tests/e2e", "tests/qa"], /playwright\.config\.ts$/);

const configs = () =>
  [
    "playwright.config.ts",
    ...sourcePaths(["tests/e2e", "tests/qa"], /playwright\.config\.ts$/),
  ].filter((p) => !p.includes("/node_modules/") && !p.startsWith("tests/qa/_archive/"));

describe("no Playwright report can hold the environment", () => {
  it("the shared web server passes only its own non-secret overrides", () => {
    const server = e2eWebServer();
    expect(Object.keys(server.env).sort()).toEqual(Object.keys(E2E_SERVER_ENV).sort());
    expect(server.env).toEqual(E2E_SERVER_ENV);
  });

  it.each(configs())("%s spreads no environment into a config field", (path) => {
    const text = sourceText(path);
    expect(text).not.toMatch(/\.\.\.process\.env/);
    // A top-level `env` block (sprint1's qa config forwarded CLERK_* keys in one) is serialised too.
    expect(text).not.toMatch(/^\s{2}env:\s*\{/m);
    // Reporters that write files write them where git ignores them (below), and never record env.
    expect(text).not.toMatch(/process\.env\.[A-Z_]*(SECRET|KEY|TOKEN|PASSWORD)/);
  });

  it("every config starts its server through the shared helper", () => {
    for (const path of configs()) {
      const text = sourceText(path);
      if (/webServer/.test(text)) expect(text, path).toMatch(/webServer: e2eWebServer\(/);
    }
  });
});

describe("what a run writes stays out of git", () => {
  it.each([
    "test-results/x/error-context.md",
    "playwright-report/index.html",
    "blob-report/report.zip",
    "tests/e2e/sprint4/test-results/x.png",
    "tests/qa/sprint9/test-results/x.png",
    "tests/qa/sprint9/playwright-report/index.html",
    "playwright-results.json",
    "tests/e2e/session/playwright-results.json",
  ])("%s is ignored", (path) => {
    // git check-ignore exits 0 and echoes the path when it's ignored.
    expect(
      execFileSync("git", ["check-ignore", "--no-index", path], { encoding: "utf8" }).trim(),
    ).toBe(path);
  });
});
