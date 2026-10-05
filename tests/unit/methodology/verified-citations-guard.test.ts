/**
 * ⚠️ VVV — the citability seed (db/seed/citability-methods/seed.ts) and
 * the methodology list (lib/methodology/methods.ts) are two independent
 * lists that drifted -- exactly how the "SE Ranking Dec 2025" fabrication
 * (task NN, removed from methods.ts) survived unnoticed in the seed for
 * months until task KKK found it there (fixed separately in task UUU).
 * Both now import the same verified (source, url) pairs from
 * lib/methodology/verified-citations.ts. This guard test scans both
 * source files' raw text for known-fabricated strings and for any
 * AutoGEO citation (task KKK: all 22 prior AutoGEO citations here were
 * for topics the real paper doesn't study -- a content-rewriting
 * framework cited for schema/robots/CDN/meta/UX/AI-endpoint signals).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KNOWN_FABRICATED_SOURCE_PATTERNS, VERIFIED_CITATIONS } from "@/lib/methodology/verified-citations";

const GUARDED_FILES = [
  "lib/methodology/methods.ts",
  "db/seed/citability-methods/seed.ts",
] as const;

// Both files' header comments document (and must keep documenting) WHY
// "SE Ranking"/"AutoGEO" are no longer cited -- that's the guardrail, not
// a violation. Strip comments so the guard only scans live code/strings.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("⚠️ VVV — verified-citations guard: no fabricated or topic-mismatched sources in either list", () => {
  for (const file of GUARDED_FILES) {
    const liveSrc = stripComments(readFileSync(file, "utf8"));

    it(`${file}: no known-fabricated source string`, () => {
      for (const pattern of KNOWN_FABRICATED_SOURCE_PATTERNS) {
        expect(liveSrc, `${file} must not match ${pattern}`).not.toMatch(pattern);
      }
    });

    it(`${file}: no AutoGEO citation (the paper is about content rewriting, not any method here)`, () => {
      expect(liveSrc).not.toMatch(/AutoGEO/i);
    });
  }

  it("both files import the same shared VERIFIED_CITATIONS module, not re-typed strings", () => {
    const methodsSrc = readFileSync("lib/methodology/methods.ts", "utf8");
    const seedSrc = readFileSync("db/seed/citability-methods/seed.ts", "utf8");
    expect(methodsSrc).toMatch(
      /import\s*\{\s*VERIFIED_CITATIONS\s*\}\s*from\s*"\.\/verified-citations"/,
    );
    expect(seedSrc).toMatch(
      /import\s*\{\s*VERIFIED_CITATIONS\s*\}\s*from\s*"@\/lib\/methodology\/verified-citations"/,
    );
  });

  it("every VERIFIED_CITATIONS entry has a non-empty name and a real https:// url", () => {
    for (const [key, { name, url }] of Object.entries(VERIFIED_CITATIONS)) {
      expect(name.length, key).toBeGreaterThan(0);
      expect(url, key).toMatch(/^https:\/\//);
    }
  });
});
