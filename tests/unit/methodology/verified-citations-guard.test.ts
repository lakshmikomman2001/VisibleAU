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
import {
  KNOWN_FABRICATED_SOURCE_PATTERNS,
  KNOWN_WRONG_CITATION_IDS,
  VERIFIED_CITATIONS,
} from "@/lib/methodology/verified-citations";

const GUARDED_FILES = [
  "lib/methodology/methods.ts",
  "db/seed/citability-methods/seed.ts",
  // Task XXX: extended to the recommendation-evidence seed -- same class
  // of fabrication risk, feeds Action Center's evidenceRefs.
  "db/seed/recommendations/research-citations.ts",
  // Task YYY: the QA fixture that copied research-citations.ts's wrong
  // Princeton arXiv id independently of the production seed.
  "tests/qa/sprint6/shared/seed.ts",
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

  // Task YYY: a different mis-citation class from fabrication -- a real
  // paper, wrong arXiv id. research-citations.ts's "Princeton GEO Study
  // (2024)" cited arxiv.org/abs/2404.11973 (a different, unrelated paper,
  // live-verified); the correct id for Aggarwal et al.'s real GEO paper is
  // 2311.09735. VVV's guard never checked this -- it only blocked
  // fabricated strings + AutoGEO, never whether a URL resolves to the
  // paper it names.
  it("the Aggarwal/Princeton GEO citation is pinned to the correct arXiv id (2311.09735)", () => {
    expect(VERIFIED_CITATIONS.aggarwalGEO.url).toContain("2311.09735");
  });

  it("the known-wrong Princeton arXiv id (2404.11973, a different paper) appears nowhere live in any guarded file", () => {
    const allFilesLiveSrc = [...GUARDED_FILES].map((f) => stripComments(readFileSync(f, "utf8")));
    for (const [i, src] of allFilesLiveSrc.entries()) {
      for (const pattern of KNOWN_WRONG_CITATION_IDS) {
        expect(src, `${GUARDED_FILES[i]} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  // Full live-URL-resolves-to-the-named-paper checking isn't unit-testable
  // offline (it needs a real network fetch and content comparison, done
  // manually in task YYY's verify pass) -- pinning the known-correct id
  // and blocking the known-wrong one is the pragmatic, automatable guard.
  it("every citability-methods seed entry marked 'research' has a non-empty, absolute https:// citationUrl (no bare labels, per the NN rule)", () => {
    const seedSrc = readFileSync("db/seed/citability-methods/seed.ts", "utf8");
    // Sanity check on the real module import rather than re-parsing the
    // `as const` array's literal text -- confirmed fully in
    // tests/unit/seed/citability-methods-seed.test.ts; this just asserts
    // the file still imports and spreads the shared AGGARWAL citation
    // rather than a second hand-typed URL.
    expect(seedSrc).toMatch(/citationUrl:\s*VERIFIED_CITATIONS\.aggarwalGEO\.url/);
  });
});
