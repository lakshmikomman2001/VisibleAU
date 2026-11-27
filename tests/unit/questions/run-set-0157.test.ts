/**
 * S04 part 2: prod-fix 0157's run set (visibility reach). run2 carries migration 0157 verbatim, then its backfill, then
 * one summary SELECT just before COMMIT (LLD amendment 80); run3 checks row-level security from the catalogue with no
 * role switch, read-only, grants one privilege at a time (amendment 92: tests/unit/questions/run-set-grant-checks.test.ts
 * holds every run3 from 0156 on to that); run1 and run3 keep each check's expected result in a comment above it.
 */
import { describe, expect, it } from "vitest";
import { sourceText } from "@/tests/helpers/source-files";

const MIGRATION = "db/migrations/0157_visibility_reach.sql";
const RUN = (n: number, name: string) => `db/prod-fixes/0157-s04-run${n}-${name}.sql`;
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

const results = (sql: string) => statements(sql).filter((s) => /^(SELECT|WITH)\b/i.test(s));
/** The statements' code with every string literal emptied. */
const codeOf = (sql: string) =>
  statements(sql)
    .join("\n")
    .replace(/'(?:[^']|'')*'/g, "''");

describe("prod-fix 0157", () => {
  it("run2's schema section is migration 0157, verbatim, inside its one transaction, before the backfill", () => {
    const run2 = sourceText(RUN2);
    const begin = "-- ==== 0157 SCHEMA (begin) ====\n";
    const end = "\n-- ==== 0157 SCHEMA (end) ====";
    const from = run2.indexOf(begin);
    const to = run2.indexOf(end);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    expect(run2.slice(from + begin.length, to)).toBe(sourceText(MIGRATION).trimEnd());
    expect(run2.indexOf("BEGIN;")).toBeLessThan(from);
    expect(run2.indexOf("-- ==== BACKFILL (begin) ====")).toBeGreaterThan(to);
    expect(run2.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("the migration is schema only: the backfill is run2's own step, and idempotent (ON CONFLICT DO NOTHING)", () => {
    expect(codeOf(sourceText(MIGRATION))).not.toMatch(/\bINSERT\s+INTO\b/i);
    const run2 = sourceText(RUN2);
    const backfill = run2.slice(
      run2.indexOf("-- ==== BACKFILL (begin) ===="),
      run2.indexOf("-- ==== BACKFILL (end) ===="),
    );
    const inserts = statements(backfill).filter((s) => /^INSERT\b/i.test(s));
    expect(inserts).toHaveLength(2);
    for (const s of inserts) expect(s).toMatch(/ON CONFLICT \([a-z_, ]+\) DO NOTHING;$/);
  });

  it("run2 returns one result: a summary SELECT just before COMMIT (amendment 80)", () => {
    const run2 = statements(sourceText(RUN2));
    expect(results(sourceText(RUN2))).toHaveLength(1);
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
    expect(run3).toMatch(/Expected: 1 row: checked 8, missing 0, missing_list empty/);
  });

  it("run1 is read-only; run1 and run3 fit Neon's 25 result tabs and say what to expect above every check", () => {
    const run1 = sourceText(RUN1);
    expect(codeOf(run1)).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|BEGIN|COMMIT)\b/i);
    for (const file of [RUN1, RUN3]) {
      const text = sourceText(file);
      expect(results(text).length, file).toBeLessThanOrEqual(25);
      const lines = text.split("\n");
      let from = 0;
      for (const statement of statements(text)) {
        if (!/^(SELECT|WITH)\b/i.test(statement)) continue;
        const first = statement.split("\n")[0].trim();
        const i = lines.findIndex(
          (line, n) => n >= from && line.replace(/--.*$/, "").trim() === first,
        );
        expect(i, `${file}: "${first}"`).toBeGreaterThan(-1);
        from = i + 1;
        expect(lines.slice(Math.max(0, i - 6), i).join("\n"), `${file}:${i + 1}`).toMatch(
          /Expected:/,
        );
      }
    }
  });

  it("run4 drops only 0157's two tables, and says it must not run under the pushed code", () => {
    const run4 = sourceText(RUN4);
    expect(run4).toMatch(/ONLY BEFORE THE S04 PUSH, or after reverting it/);
    expect(run4).toContain('DROP TABLE IF EXISTS "audit_reach_results";');
    expect(run4).toContain('DROP TABLE IF EXISTS "brand_visibility_scopes";');
    expect(codeOf(run4).match(/\bDROP\b/gi)).toHaveLength(2);
    expect(run4.trimEnd().endsWith("COMMIT;")).toBe(true);
  });
});
