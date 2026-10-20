import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Vunnara (21 Oct), item 1 -- the hotfix's own named grep-guard test.
 * `citations.position` (the Drizzle schema column reference) must never
 * be read again for display or scoring: production audit #30 showed
 * the OLD character-offset heuristic baked into that column ("Usually
 * #16") is wrong for every citation written before extractListRank was
 * wired into detect-mention.ts (post-a093ceb) -- which is every
 * production row as of 20 Oct. lib/scoring/resolve-audit-dimensions.ts
 * and lib/audit/recompute-citation-positions.ts now recompute the real
 * rank at READ TIME instead, from each row's own response text.
 *
 * `citations\.position` as a search pattern is precise, not a loose
 * heuristic: every legitimate WRITE of this column passes `mention.
 * position` (a fresh detectBrandMention result) as the VALUE, with
 * `position` as a bare object key -- `citations.position` as an
 * r-value only ever appears in a SELECT/WHERE/aggregate, i.e. a READ.
 *
 * Two files are allowed to still contain the literal string, both
 * already reviewed and explained here rather than silently excluded:
 *  - lib/scoring/resolve-audit-dimensions.ts -- only in its own doc
 *    comment, explaining exactly this rule.
 *  - components/domain/audit/audit-results-rich.tsx -- genuinely
 *    unreachable dead code (no route under app/ renders it, confirmed
 *    by grepping for its name); see that file's own doc comment.
 * Any OTHER file in app/, components/, lib/, or inngest/ matching this
 * pattern is a real regression this test must catch.
 */
const ALLOWED_FILES = new Set([
  "lib/scoring/resolve-audit-dimensions.ts",
  "components/domain/audit/audit-results-rich.tsx",
]);

const SCAN_DIRS = ["app", "components", "lib", "inngest"];

// Several files' own doc comments explain this rule using the literal
// string "citations.position" in prose (e.g. this file's own header
// above) -- stripped before checking, same heuristic as tests/unit/
// copy/no-double-hyphen-dash.test.ts, so only an actual CODE reference
// (a real SELECT/WHERE/aggregate) fails this test.
function stripComments(source: string): string {
  const noBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlockComments.replace(/(^|\s)\/\/.*$/gm, "$1");
}

function gitLsFiles(dir: string): string[] {
  const repoRoot = path.resolve(__dirname, "../../..");
  const out = execFileSync("git", ["ls-files", "--", dir], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => (l.endsWith(".ts") || l.endsWith(".tsx")) && !l.includes("/tests/"));
}

describe("citations.position is never read again for display or scoring", () => {
  it("no file outside the documented allowlist references the stored column", () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const offenders: string[] = [];

    for (const dir of SCAN_DIRS) {
      for (const relativePath of gitLsFiles(dir)) {
        if (ALLOWED_FILES.has(relativePath)) continue;
        const absolutePath = path.join(repoRoot, relativePath);
        const code = stripComments(readFileSync(absolutePath, "utf-8"));
        if (/citations\.position\b/.test(code)) {
          offenders.push(relativePath);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
