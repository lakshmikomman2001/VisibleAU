/**
 * S04 part 0j (LLD amendment 92; runbook section 5): a run3 grant check tests one privilege at a time.
 * has_table_privilege and has_column_privilege with a comma list ('SELECT,INSERT,UPDATE,DELETE') are true when ANY one
 * privilege is held, so 0155's and 0156's first run3 checks would have passed with SELECT alone. From 0156 on, every
 * run3 lists each (object, privilege) pair and returns one summary row; this fails on a comma list in either function.
 * The reviewed 0156 run3 (it ran in production on 27 Nov 2026: checked 28, missing 0) is the repo's copy.
 */
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceText } from "@/tests/helpers/source-files";

const FIRST = 156;
const run3s = readdirSync("db/prod-fixes")
  .filter((name) => /^\d{4}-.*run3.*\.sql$/.test(name) && Number(name.slice(0, 4)) >= FIRST)
  .map((name) => `db/prod-fixes/${name}`)
  .sort();

/** Each has_table_privilege / has_column_privilege call's privilege argument (its last string literal), commented lines left out. */
function privilegeArguments(sql: string): string[] {
  const code = sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  const out: string[] = [];
  const call = /has_(?:table|column)_privilege\s*\(([^)]*)\)/gi;
  for (const m of code.matchAll(call)) {
    const literals = [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((l) => l[1]);
    out.push(literals.at(-1) ?? "");
  }
  return out;
}

describe("run3 grant checks, one privilege at a time (amendment 92)", () => {
  it("there are run3 files from 0156 on to check", () => {
    expect(run3s).toContain("db/prod-fixes/0156-s03-run3-post-check.sql");
  });

  it.each(
    run3s,
  )("%s passes no comma list to has_table_privilege or has_column_privilege", (path) => {
    const lists = privilegeArguments(sourceText(path)).filter((p) => p.includes(","));
    expect(lists).toEqual([]);
  });

  it("the reviewed 0156 run3: each privilege on its own, one summary row (checked, missing, the missing list)", () => {
    const run3 = sourceText("db/prod-fixes/0156-s03-run3-post-check.sql");
    expect(run3).toMatch(/Expected: 1 row: checked 28, missing 0, missing_list empty/);
    expect(run3).toMatch(/AS checked,/);
    expect(run3).toMatch(/AS missing,/);
    expect(run3).toMatch(/AS missing_list/);
    expect(run3).toMatch(/\('table', 'brand_question_packs', 'DELETE'\)/);
  });
});
