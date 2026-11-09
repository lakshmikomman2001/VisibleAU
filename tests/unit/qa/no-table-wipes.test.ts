/**
 * Playwright-run follow-ups (10 Nov), part 7 -- tests/setup.ts deleted every brand, user and organisation
 * before each test, and nothing referenced it: one `setupFiles` line from wiping the database a run points at.
 * It's gone, and no test file may delete every row of those tables, wherever it's wired in.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

readSourcesBeforeAll(["tests", "vitest.config.ts", "vitest.config.e2e.ts"]);

const WIPE =
  /\.delete\((?:schema\.)?(?:brands|users|organizations)\)\s*;|DELETE FROM (?:brands|users|organizations)\s*(?:;|`|"|'|$)/m;

describe("no test setup wipes the workspace tables", () => {
  it("tests/setup.ts is gone", () => {
    expect(existsSync("tests/setup.ts")).toBe(false);
  });

  it("no file under tests/ deletes every brand, user or organisation", () => {
    const files = sourcePaths(["tests"]).filter((p) => !p.includes("/node_modules/"));
    expect(files.filter((p) => WIPE.test(sourceText(p).replace(/^\s*(\/\/|\*).*$/gm, "")))).toEqual(
      [],
    );
  });

  it("no vitest config names a setup file that isn't there", () => {
    for (const config of ["vitest.config.ts", "vitest.config.e2e.ts"]) {
      // File paths only: `include` globs ("tests/**/*.test.ts") aren't files.
      for (const m of sourceText(config).matchAll(/["'](\.\/)?(tests\/[^"'*]+\.ts)["']/g)) {
        expect(existsSync(m[2]), `${config}: ${m[2]}`).toBe(true);
      }
    }
  });
});
