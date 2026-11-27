/**
 * S03 part 1: prod-fix 0156's run set. run2 carries migration 0156 verbatim (Sri runs the prod-fix in Neon; the
 * migration is what local databases and the tests get), so the two never drift. LLD amendment 80 (Neon's SQL editor:
 * at most 25 result tabs; the production role can't SET ROLE visibleau_app): run2 ends with one summary SELECT just
 * before COMMIT; run3 checks row-level security from the catalogue with no role switch, read-only; run1 and run3 keep
 * each check's expected result in a comment above it.
 */
import { describe, expect, it } from "vitest";
import { sourceText } from "@/tests/helpers/source-files";

const MIGRATION = "db/migrations/0156_question_packs.sql";
const RUN = (n: number, name: string) => `db/prod-fixes/0156-s03-run${n}-${name}.sql`;
const RUN1 = RUN(1, "precheck");
const RUN2 = RUN(2, "apply");
const RUN3 = RUN(3, "post-check");
const RUN4 = RUN(4, "rollback");

/** The SQL without comments, split into statements (DO blocks kept whole). */
function statements(sql: string): string[] {
  const code = sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  const out: string[] = [];
  let current = "";
  let inDo = false;
  for (const line of code.split("\n")) {
    current += `${line}\n`;
    if (/\$\$/.test(line)) inDo = (line.match(/\$\$/g) ?? []).length % 2 === 1 ? !inDo : inDo;
    if (!inDo && /;\s*$/.test(line)) {
      if (current.trim()) out.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

const selects = (sql: string) => statements(sql).filter((s) => /^SELECT\b/i.test(s));
/** The statements' code with every string literal emptied ('SELECT,INSERT' names privileges, not commands). */
const codeOf = (sql: string) =>
  statements(sql)
    .join("\n")
    .replace(/'(?:[^']|'')*'/g, "''");

describe("prod-fix 0156", () => {
  it("run2's schema section is migration 0156, verbatim, in one transaction", () => {
    const run2 = sourceText(RUN2);
    const begin = "-- ==== 0156 SCHEMA (begin) ====\n";
    const end = "\n-- ==== 0156 SCHEMA (end) ====";
    const from = run2.indexOf(begin);
    const to = run2.indexOf(end);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    expect(run2.slice(from + begin.length, to)).toBe(sourceText(MIGRATION).trimEnd());
    expect(run2.indexOf("BEGIN;")).toBeLessThan(from);
    expect(run2.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("run2 returns one result: a summary SELECT just before COMMIT (amendment 80)", () => {
    const run2 = statements(sourceText(RUN2));
    expect(selects(sourceText(RUN2))).toHaveLength(1);
    expect(run2.at(-1)).toBe("COMMIT;");
    expect(run2.at(-2)).toMatch(/^SELECT\b/);
  });

  it("run3 checks RLS from the catalogue, read-only, with no role switch (amendment 80)", () => {
    const run3 = sourceText(RUN3);
    const code = codeOf(run3);
    expect(code).not.toMatch(/\bSET\s+(LOCAL\s+)?ROLE\b/i);
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
    expect(statements(run3)[0]).toBe("BEGIN READ ONLY;");
    expect(statements(run3).at(-1)).toBe("ROLLBACK;");
    expect(code).toMatch(/pg_policies/);
    expect(code).toMatch(/relforcerowsecurity/);
    expect(statements(run3).join("\n")).toMatch(/has_table_privilege\('visibleau_app'/);
  });

  it("run1 is read-only; run1 and run3 fit Neon's 25 result tabs and say what to expect above every check", () => {
    const run1 = sourceText(RUN1);
    expect(codeOf(run1)).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|BEGIN|COMMIT)\b/i);
    for (const file of [RUN1, RUN3]) {
      const text = sourceText(file);
      expect(selects(text).length, file).toBeLessThanOrEqual(25);
      const lines = text.split("\n");
      // S04 part 0j (LLD amendment 92): "run3 checks each privilege on its own and returns one row" -- the reviewed
      // run3's grant check is one WITH ... SELECT statement, so the expectation sits above each statement's first line
      // (a SELECT or a WITH), not above every line that starts with SELECT.
      let from = 0;
      for (const statement of statements(text)) {
        if (!/^(SELECT|WITH)\b/i.test(statement)) continue;
        const first = statement.split("\n")[0].trim();
        const i = lines.findIndex(
          (line, n) => n >= from && line.replace(/--.*$/, "").trim() === first,
        );
        expect(i, `${file}: "${first}"`).toBeGreaterThan(-1);
        from = i + 1;
        const above = lines.slice(Math.max(0, i - 6), i).join("\n");
        expect(above, `${file}:${i + 1}`).toMatch(/Expected:/);
      }
    }
  });

  it("run4 undoes only 0156's schema, and says it must not run under the pushed code", () => {
    const run4 = sourceText(RUN4);
    expect(run4).toMatch(/ONLY BEFORE THE S03 PUSH, or after reverting it/);
    expect(run4).toContain('DROP TABLE IF EXISTS "brand_question_packs";');
    expect(run4).toContain('ALTER TABLE "organizations" DROP COLUMN IF EXISTS "question_packs";');
    expect(run4.trimEnd().endsWith("COMMIT;")).toBe(true);
  });
});
