// Task #46 (14th follow-up) -- Part B proof: biome.json's noRestrictedImports
// rule (see the rule's own `message` for the full rationale) must actually
// reject a `serviceDb` import from a path outside the allowlist, and must
// actually allow one from an allowlisted path. This writes real, temporary
// fixture files under the repo (so Biome's path-based `overrides` matching
// -- which did not reliably fire against `--stdin-file-path` input in this
// Biome version -- sees a real file), runs the real `biome` binary against
// them the same way `pnpm lint` does, and deletes them in `afterEach`
// regardless of outcome. Nothing here is left behind for `pnpm lint` to
// trip over on a normal run.
//
// Invokes the resolved node_modules/.bin/biome binary directly rather than
// `npx biome` -- under the full suite's parallel test-worker contention,
// `npx` itself (not biome) was observed to fail outright, its stdout
// containing only npm's own "Unknown env config" warnings and nothing from
// biome at all. Same root cause this codebase already hit once before in
// tests/phase2/sprint1/section5-cli-service-integration.test.ts (npx's own
// resolution overhead/contention, not the underlying CLI) -- resolved there
// by dropping npx's resolution step; here by skipping npx entirely, since
// the binary is already a resolved local devDependency.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
// CI (ubuntu-latest) has no .CMD shim; Windows dev machines need it.
const BIOME_BIN = resolve(
  ROOT,
  `node_modules/.bin/biome${process.platform === "win32" ? ".CMD" : ""}`,
);
const BIOME_EXEC_TIMEOUT_MS = 25000;

const DISALLOWED_IMPORT_FIXTURE = [
  'import { serviceDb } from "@/db/client";',
  "",
  "export function leak() {",
  "  return serviceDb;",
  "}",
  "",
].join("\n");

let fixtureDirAbsPath: string | null = null;

afterEach(() => {
  if (fixtureDirAbsPath && existsSync(fixtureDirAbsPath)) {
    rmSync(fixtureDirAbsPath, { recursive: true, force: true });
  }
  fixtureDirAbsPath = null;
});

function runBiomeCheck(relativePath: string, source: string): { exitCode: number; output: string } {
  const fixtureAbsPath = resolve(ROOT, relativePath);
  fixtureDirAbsPath = dirname(fixtureAbsPath);
  mkdirSync(fixtureDirAbsPath, { recursive: true });
  writeFileSync(fixtureAbsPath, source);

  try {
    const output = execFileSync(BIOME_BIN, ["check", relativePath], {
      cwd: ROOT,
      stdio: "pipe",
      timeout: BIOME_EXEC_TIMEOUT_MS,
      encoding: "utf8",
      shell: true,
    });
    return { exitCode: 0, output };
  } catch (err) {
    const e = err as { status: number | null; stdout: string; stderr: string };
    return { exitCode: e.status ?? 1, output: `${e.stdout}${e.stderr}` };
  }
}

describe("biome.json noRestrictedImports fence on serviceDb (Task #46, 14th follow-up)", () => {
  it("a serviceDb import outside the allowlist fails `pnpm lint`", { timeout: 30000 }, () => {
    const { exitCode, output } = runBiomeCheck(
      "app/_lint-fence-fixture-disallowed/route.ts",
      DISALLOWED_IMPORT_FIXTURE,
    );

    expect(exitCode).not.toBe(0);
    expect(output).toContain("lint/style/noRestrictedImports");
    expect(output).toContain("serviceDb bypasses Postgres RLS entirely");
  });

  it("the same serviceDb import inside an allowlisted path (lib/auth/**) passes", {
    timeout: 30000,
  }, () => {
    const { exitCode, output } = runBiomeCheck(
      "lib/auth/_lint-fence-fixture-allowed/example.ts",
      DISALLOWED_IMPORT_FIXTURE.replace("leak", "readIt"),
    );

    expect(exitCode).toBe(0);
    expect(output).not.toContain("noRestrictedImports");
  });
});
