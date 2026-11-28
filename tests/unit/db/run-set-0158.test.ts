/**
 * S04B part 2: prod-fix 0158's run set (engine_call_failures.error_class gains 'provider_quota', LLD amendment 100).
 * run2 carries migration 0158 verbatim inside one transaction and ends with one summary SELECT just before COMMIT
 * (amendment 80); run1 and run3 are read-only, fit Neon's 25 result tabs and say what to expect above every check;
 * run4 relabels provider_quota rows 'other' before restoring 0123's check, and says when it may run.
 */
import { describe, expect, it } from "vitest";
import { sourceText } from "@/tests/helpers/source-files";

const MIGRATION = "db/migrations/0158_engine_error_provider_quota.sql";
const RUN = (n: number, name: string) => `db/prod-fixes/0158-s04b-run${n}-${name}.sql`;
const RUN1 = RUN(1, "precheck");
const RUN2 = RUN(2, "apply");
const RUN3 = RUN(3, "post-check");
const RUN4 = RUN(4, "rollback");

const NINE = [
  "rate_limited",
  "overloaded",
  "timeout",
  "search_tool_error",
  "empty_response",
  "parse_error",
  "other",
  "incomplete_answer",
  "provider_quota",
];

/** The SQL without comments, split into statements. */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith(";") ? s : `${s};`));
}
const results = (sql: string) => statements(sql).filter((s) => /^(SELECT|WITH)\b/i.test(s));
const codeOf = (sql: string) =>
  statements(sql)
    .join("\n")
    .replace(/'(?:[^']|'')*'/g, "''");

describe("prod-fix 0158", () => {
  it("the migration re-adds the error_class check with the nine classes, and writes no row", () => {
    const migration = sourceText(MIGRATION);
    const check = migration.slice(migration.indexOf("CHECK (error_class IN ("));
    for (const c of NINE) expect(check, c).toContain(`'${c}'`);
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS engine_call_failures_error_class_check");
    expect(codeOf(migration)).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  });

  it("run2 is migration 0158 verbatim, in one transaction, with one summary SELECT just before COMMIT", () => {
    const run2 = sourceText(RUN2);
    const begin = "-- ==== 0158 SCHEMA (begin) ====\n";
    const end = "\n-- ==== 0158 SCHEMA (end) ====";
    const from = run2.indexOf(begin);
    const to = run2.indexOf(end);
    expect(from).toBeGreaterThan(-1);
    expect(run2.slice(from + begin.length, to)).toBe(sourceText(MIGRATION).trimEnd());
    expect(run2.indexOf("BEGIN;")).toBeLessThan(from);
    const list = statements(run2);
    expect(list.at(-1)).toBe("COMMIT;");
    expect(list.at(-2)).toMatch(/^SELECT\b/);
    expect(results(run2)).toHaveLength(1);
    expect(run2).toMatch(/BEFORE the S04B push/);
  });

  it("run1 and run3 are read-only, fit Neon's 25 result tabs and say what to expect above every check", () => {
    expect(codeOf(sourceText(RUN1))).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|BEGIN|COMMIT)\b/i,
    );
    const run3 = sourceText(RUN3);
    expect(codeOf(run3)).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
    expect(codeOf(run3)).not.toMatch(/\bSET\s+(LOCAL\s+)?ROLE\b/i);
    expect(statements(run3)[0]).toBe("BEGIN READ ONLY;");
    expect(statements(run3).at(-1)).toBe("ROLLBACK;");
    for (const file of [RUN1, RUN3]) {
      const text = sourceText(file);
      expect(results(text).length, file).toBeLessThanOrEqual(25);
      const blocks = text.split(/\n(?=-- \d+\. )/).slice(1);
      expect(blocks.length, file).toBe(results(text).length);
      for (const block of blocks)
        expect(block, `${file}: ${block.slice(0, 40)}`).toMatch(/Expected:/);
    }
  });

  it("run3 checks all nine classes and that the check is validated", () => {
    const run3 = sourceText(RUN3);
    for (const c of NINE) expect(run3, c).toContain(`'${c}'`);
    expect(run3).toContain("convalidated");
  });

  it("run4 relabels provider_quota rows 'other', then restores 0123's eight classes, only before the push", () => {
    const run4 = sourceText(RUN4);
    expect(run4).toMatch(/ONLY BEFORE THE S04B PUSH, or after reverting it/);
    const update = run4.indexOf(
      "UPDATE engine_call_failures SET error_class = 'other' WHERE error_class = 'provider_quota';",
    );
    const alter = run4.indexOf("ALTER TABLE engine_call_failures");
    expect(update).toBeGreaterThan(-1);
    expect(alter).toBeGreaterThan(update);
    const check = run4.slice(alter, run4.indexOf("));", alter));
    for (const c of NINE.slice(0, 8)) expect(check, c).toContain(`'${c}'`);
    expect(check).not.toContain("'provider_quota'");
    expect(statements(run4).at(-1)).toBe("COMMIT;");
  });
});
