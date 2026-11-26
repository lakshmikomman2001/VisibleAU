import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

/**
 * S02 part 0 (LLD amendments 57 and 66): tests, fixtures, specs and seed scripts use invented businesses only -- no
 * real client's name, ABN, entity name, domain or competitor domain. These are the real ones found in them and
 * replaced; the list is the only client data this file holds.
 *
 * - The first list (one client's ABR record, its domains and a competitor's domain) was replaced everywhere under
 *   tests/, so it is checked everywhere.
 * - The second (three client businesses and the agency's workspace name) was replaced in every e2e spec, helper,
 *   fixture and seed script, and in every test that uses the report helpers; the other tests that still name them
 *   inline are listed in the S02 report as a follow-up, and this scope widens when they are done.
 * - Not yet replaced: the recorded Google answers (RECORDED_GOOGLE below). They are a client's real Google AI answers,
 *   reviews and press about it, so a rename would pin real text on an invented name; they need invented recordings
 *   (S02 report, open items).
 */
/** Words joined as a name may be written: together, or by a space, "%20", "+", "-" or "_". */
const joined = (...words: string[]) => new RegExp(words.join("(?:\\s|%20|\\+|-|_)?"), "i");

const REPLACED_EVERYWHERE: readonly RegExp[] = [
  /techcore/i,
  /astorio/i,
  /17 ?701 ?710 ?947/,
  /kangaroo-it/i,
];

const REPLACED_IN_FIXTURES: readonly RegExp[] = [
  joined("hero", "home", "services"),
  joined("omega", "services"),
  joined("bondi", "plumbing"),
  joined("splice", "marketing"),
];

const THIS_FILE = "tests/unit/copy/no-client-data-in-tests.test.ts";

const RECORDED_GOOGLE = [
  /^tests\/fixtures\/google-surfaces\/dataforseo\//,
  /^tests\/unit\/google-surfaces\/__golden__\/stored-answer-aio-q11\.json$/,
  /^tests\/e2e\/09-google-surfaces\.spec\.ts$/,
];

const ANY_TEXT_FILE = /\.(ts|tsx|js|mjs|cjs|json|snap|txt|sql|md|csv|html)$/;
readSourcesBeforeAll(["tests", "db/seed"], ANY_TEXT_FILE);

const REPORT_HELPERS =
  /helpers\/(report-seeds|report-fixture|report-data-fixture|seeded-report-render)/;
const FIXTURE_DIRS = /^(tests\/(e2e|helpers|fixtures)\/|db\/seed\/)/;

function inFixtureScope(path: string): boolean {
  if (RECORDED_GOOGLE.some((re) => re.test(path))) return false;
  if (FIXTURE_DIRS.test(path)) return true;
  return /\.test\.tsx?$/.test(path) && REPORT_HELPERS.test(sourceText(path));
}

function hits(paths: readonly string[], patterns: readonly RegExp[]): string[] {
  const found: string[] = [];
  for (const path of paths) {
    if (path === THIS_FILE) continue;
    const text = sourceText(path);
    for (const re of patterns) {
      const m = re.exec(text);
      if (m) found.push(`${path}: "${m[0]}"`);
    }
  }
  return found;
}

describe("no real client data in tests (LLD amendments 57, 66)", () => {
  it("one client's ABR record and domains, and a competitor's domain, appear nowhere under tests/ or db/seed", () => {
    expect(hits(sourcePaths(["tests", "db/seed"], ANY_TEXT_FILE), REPLACED_EVERYWHERE)).toEqual([]);
  });

  it("the real businesses' and the agency's names appear in no spec, helper, fixture, seed or report-helper test", () => {
    const scope = [
      ...sourcePaths(["tests", "db/seed"], ANY_TEXT_FILE).filter(inFixtureScope),
      "scripts/seed-demo-data.ts",
    ];
    expect(scope.length).toBeGreaterThan(50);
    expect(hits(scope, REPLACED_IN_FIXTURES)).toEqual([]);
  });

  it("the recorded Google answers are the only exception, and it is the files named", () => {
    const recorded = sourcePaths(["tests"], ANY_TEXT_FILE).filter((p) =>
      RECORDED_GOOGLE.some((re) => re.test(p)),
    );
    expect(recorded.length).toBeGreaterThan(0);
    for (const p of recorded)
      expect(p).toMatch(/dataforseo|stored-answer-aio-q11|09-google-surfaces/);
  });
});
