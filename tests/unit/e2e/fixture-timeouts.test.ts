/**
 * S04 part 0i (LLD amendment 91): test hygiene.
 * - A Playwright spec that signs in through the testSignedInAs fixture sets a long timeout before its tests start
 *   (test.describe.configure({ timeout }) or the config), never with test.setTimeout inside a test: that starts only
 *   after the fixtures, so signing in on a cold server ran against the config's 60 s (spec 18's first run).
 * - tests/helpers/report-seeds.ts picks the open item it hides by title: the audit writes its items in one
 *   transaction, so ORDER BY created_at, id picked by a random id (sometimes leaving OTHER ACTIONS empty).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function specs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) specs(path, out);
    else if (name.endsWith(".spec.ts")) out.push(path.replace(/\\/g, "/"));
  }
  return out;
}

describe("long Playwright timeouts cover the sign-in fixture", () => {
  it("no spec using testSignedInAs calls test.setTimeout inside a test", () => {
    const all = [...specs("tests/e2e"), ...specs("tests/qa")];
    expect(all.length).toBeGreaterThan(30);
    const offenders = all.filter((path) => {
      const text = readFileSync(path, "utf8");
      return /\btestSignedInAs\b/.test(text) && /\btest\.setTimeout\(/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it("specs 17 and 18 set theirs with test.describe.configure", () => {
    for (const path of [
      "tests/e2e/17-s03-questions-edit.spec.ts",
      "tests/e2e/18-s03-confirm-questions.spec.ts",
    ]) {
      expect(readFileSync(path, "utf8"), path).toMatch(
        /test\.describe\.configure\(\{ timeout: \d{3}_000 \}\)/,
      );
    }
  });
});

describe("the report seeds hide the same item every run", () => {
  it("the hidden item is chosen by title, not by created_at and a random id", () => {
    const seeds = readFileSync("tests/helpers/report-seeds.ts", "utf8");
    const query = seeds.slice(seeds.indexOf("const [other]"), seeds.indexOf("if (other)"));
    expect(query).toMatch(/ORDER BY title COLLATE "C", id LIMIT 1/);
    expect(query).not.toMatch(/ORDER BY created_at/);
  });
});
