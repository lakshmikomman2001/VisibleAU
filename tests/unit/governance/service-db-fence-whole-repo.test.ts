// Task #46 (15th follow-up), Part D: the fence biome.json added in the 14th
// follow-up was only ever proven against temporary fixture files written
// to disk for that one test, never against the ACTUAL repo -- and with a
// 435/349/272 pre-existing lint baseline, `pnpm lint`'s own exit code
// can't be read as "the fence is clean" either way. This test runs ONLY
// the `lint/style/noRestrictedImports` rule, across the WHOLE real repo,
// and fails on any hit -- gating the fence regardless of the unrelated
// baseline. The second test proves it actually catches a regression: a
// disallowed import appearing anywhere new in the real source tree, not
// just in a hand-picked single file.
//
// A first version of this test mutated middleware.ts in place
// (write -> check -> restore in a `finally`) -- mutating a real, shared,
// git-tracked file turned out to be genuinely unsafe: it raced with a
// concurrently-running full-suite `pnpm test` invocation (started
// earlier in this same session) and left middleware.ts corrupted on
// disk, because both processes read/wrote the same path at overlapping
// times. Fixed by creating a brand-new file instead -- nothing else in
// the repo or test suite reads or writes this path, so there is no
// shared state to race on. `app/` is scanned by biome.json's own
// `files.includes` and is NOT matched by any of the serviceDb fence's
// override groups (lib/auth/**, lib/governance/**, inngest/**, db/**,
// scripts/**, app/api/webhooks/**, tests/**, the specific lib/
// subdirectories, or the explicitly-listed app/api/**/route.ts and .tsx
// paths) -- a genuinely real, non-allowlisted location.
//
// Follow-ups from af8de42..d1eb5a1 (10 Nov), part 4: the proof file was app/__part-d-proof-fixture.ts, in the
// real tree, so any other scan running at the same time read it (no-stale-composite-read failed once on it).
// The proof now runs in an OS temp directory holding a copy of biome.json (its linter rules and overrides as
// they are; only `vcs` off, which needs a git checkout), with the proof at app/ and at an allowlisted path.
// Nothing is ever written into the repo.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
// CI (ubuntu-latest) has no .CMD shim; Windows dev machines need it.
const BIOME_BIN = resolve(
  ROOT,
  `node_modules/.bin/biome${process.platform === "win32" ? ".CMD" : ""}`,
);
const CHECK_TIMEOUT_MS = 60000;
const PROOF_NAME = "__part-d-proof-fixture.ts";
const DISALLOWED_IMPORT =
  'import { serviceDb as __partDProofServiceDb } from "@/db/client";\n\nexport const __partDProof = __partDProofServiceDb;\n';

let proofDir: string | null = null;
afterEach(() => {
  if (proofDir) rmSync(proofDir, { recursive: true, force: true });
  proofDir = null;
});

/** A temp copy of the repo's fence: biome.json as it is (vcs off), and the proof at app/ and at lib/auth/. */
function writeProofOutsideRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "service-db-fence-"));
  const config = JSON.parse(readFileSync(resolve(ROOT, "biome.json"), "utf8")) as Record<
    string,
    unknown
  >;
  config.vcs = { enabled: false };
  writeFileSync(join(dir, "biome.json"), JSON.stringify(config, null, 2));
  mkdirSync(join(dir, "app"));
  writeFileSync(join(dir, "app", PROOF_NAME), DISALLOWED_IMPORT);
  mkdirSync(join(dir, "lib", "auth"), { recursive: true });
  writeFileSync(join(dir, "lib", "auth", PROOF_NAME), DISALLOWED_IMPORT);
  return dir;
}

function runWholeRepoCheck(cwd: string = ROOT): string {
  // --max-diagnostics defaults to 20 -- with a 435/349/272 pre-existing
  // baseline (~1000 diagnostics total), a new hit on a file that doesn't
  // happen to sort into the first 20 would be silently truncated away,
  // not reported as zero. Confirmed empirically against this exact
  // scenario before adding the flag.
  //
  // --reporter=json (23 Oct baseline-reconciliation follow-up): the
  // DEFAULT reporter prints a human diff for every file with a
  // FORMATTING issue too, not just lint hits -- on a CRLF checkout
  // (this repo's core.autocrlf=true), THIS test file itself gets
  // flagged for CRLF-vs-LF formatting, and biome quotes the
  // surrounding lines of that diff, which happen to include this
  // file's own comments/assertions naming "lint/style/
  // noRestrictedImports" as plain text -- 3 false "hits" with zero
  // real violations behind them, reproduced identically across
  // multiple runs. The JSON reporter's structured category field can't
  // be confused with formatter-diff prose.
  try {
    return execFileSync(BIOME_BIN, ["check", ".", "--max-diagnostics=5000", "--reporter=json"], {
      cwd,
      stdio: "pipe",
      timeout: CHECK_TIMEOUT_MS,
      encoding: "utf8",
      shell: true,
      maxBuffer: 1024 * 1024 * 64,
    });
  } catch (err) {
    const e = err as { stdout: string; stderr: string };
    return `${e.stdout}${e.stderr}`;
  }
}

// biome's --json reporter is marked "unstable/experimental" (its own
// first output line says so) and, on Windows, emits invalid JSON --
// `location.path` contains unescaped backslashes ("lib\foo\bar.ts"),
// so this reads the one field it needs as text instead of
// JSON.parse-ing the payload. Matches ONLY the structured
// `"category":"..."` key, never a bare substring search against
// human-readable text that could quote the rule's name for an
// unrelated reason (see runWholeRepoCheck's comment above).
function countNoRestrictedImportsHits(output: string): number {
  return (output.match(/"category":"lint\/style\/noRestrictedImports"/g) ?? []).length;
}

describe("serviceDb fence gates the whole repo (Task #46, 15th follow-up, Part D)", () => {
  it("the real repo today has zero noRestrictedImports violations", {
    timeout: CHECK_TIMEOUT_MS + 10000,
  }, () => {
    const output = runWholeRepoCheck();
    expect(countNoRestrictedImportsHits(output)).toBe(0);
  });

  it("a disallowed serviceDb import appearing anywhere new, non-allowlisted in the real source tree is caught", {
    timeout: CHECK_TIMEOUT_MS + 10000,
  }, () => {
    proofDir = writeProofOutsideRepo();
    // The repo never holds it, so no other scan can read it.
    expect(existsSync(resolve(ROOT, "app", PROOF_NAME))).toBe(false);

    const output = runWholeRepoCheck(proofDir);
    // Caught at app/, and only there: lib/auth/ is one of the fence's allowlisted paths.
    expect(countNoRestrictedImportsHits(output)).toBe(1);
    expect(output).toMatch(/"path":"app[\\/]__part-d-proof-fixture\.ts"/);
  });
});
