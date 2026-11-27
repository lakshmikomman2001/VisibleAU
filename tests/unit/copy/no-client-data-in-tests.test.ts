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
 *   fixture and seed script, and in every test that uses the report helpers, in S02 part 0; S03 part 0 (LLD
 *   amendment 77) replaced the rest under tests/ with the same mapping, so it is checked everywhere too.
 * - S03 part 0 also replaced the recorded Google answers that named a client (tests/fixtures/google-surfaces/
 *   dataforseo/, their golden and spec 09) with invented recordings of the same shape, so they have no exception.
 * - S04 part 0h (LLD amendment 90): production code's comments (app/, lib/, components/) named the client businesses
 *   too; they read S02's invented names now, so the five businesses' names are checked there as well. Suburbs such
 *   as Bondi stay: they are place data.
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

/** The real recordings' other details: a name-alike business's sites, the client's street and a TV programme's piece. */
const RECORDED_DETAILS: readonly RegExp[] = [
  /omega-plumbing/i,
  /omegatechserv/i,
  /brookhollow/i,
  /current.affair/i,
];

const THIS_FILE = "tests/unit/copy/no-client-data-in-tests.test.ts";

const ANY_TEXT_FILE = /\.(ts|tsx|js|mjs|cjs|json|snap|txt|sql|md|csv|html)$/;
/** The mock model's canned answers are recorded responses too (amendment 57): S03 part 0 renamed them. */
const MOCK_ANSWERS = "lib/llm/mock-responses";
/** S04 part 0h (LLD amendment 90): the production folders the five businesses' names are checked in. */
const PRODUCTION = ["app", "lib", "components"];
readSourcesBeforeAll(["tests", "db/seed", MOCK_ANSWERS, ...PRODUCTION], ANY_TEXT_FILE);

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

describe("no real client data in tests (LLD amendments 57, 66, 77) or production code (90)", () => {
  it("one client's ABR record and domains, and a competitor's domain, appear nowhere under tests/ or db/seed", () => {
    expect(hits(sourcePaths(["tests", "db/seed"], ANY_TEXT_FILE), REPLACED_EVERYWHERE)).toEqual([]);
  });

  it("the real businesses' and the agency's names appear nowhere under tests/ or db/seed, in the demo seed or in the mock model's answers", () => {
    const scope = [
      ...sourcePaths(["tests", "db/seed", MOCK_ANSWERS], ANY_TEXT_FILE),
      "scripts/seed-demo-data.ts",
    ];
    expect(scope.length).toBeGreaterThan(1000);
    expect(scope.filter((p) => p.startsWith(MOCK_ANSWERS)).length).toBeGreaterThanOrEqual(16);
    expect(hits(scope, REPLACED_IN_FIXTURES)).toEqual([]);
  });

  it("the five businesses' names appear nowhere in app/, lib/ or components/ (LLD amendment 90)", () => {
    const scope = sourcePaths(PRODUCTION, ANY_TEXT_FILE);
    expect(scope.length).toBeGreaterThan(900);
    expect(hits(scope, [...REPLACED_IN_FIXTURES, /techcore/i])).toEqual([]);
  });

  it("the recorded Google answers name no client: they are invented recordings, with no exception", () => {
    const recorded = sourcePaths(["tests"], ANY_TEXT_FILE).filter((p) =>
      /^tests\/fixtures\/google-surfaces\/dataforseo\/|stored-answer-aio-q11|09-google-surfaces/.test(
        p,
      ),
    );
    expect(recorded.length).toBeGreaterThanOrEqual(16);
    expect(
      hits(recorded, [...REPLACED_EVERYWHERE, ...REPLACED_IN_FIXTURES, ...RECORDED_DETAILS]),
    ).toEqual([]);
  });
});
