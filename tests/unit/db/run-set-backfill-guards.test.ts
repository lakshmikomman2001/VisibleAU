/**
 * S04B part 6 (LLD amendment 107; runbook section 5): every run2 from 0157 on that writes into a table with FORCE row
 * level security (a backfill across every workspace) starts with 0155's check that the role bypasses RLS -- before its
 * first INSERT, so a role that doesn't stops at once with a plain message instead of writing nothing or part -- and
 * guards every division with nullif(..., 0): 0157's first run2 stopped with "division by zero" on a local copy with a
 * complete audit that had no everyday answers. A divisor is guarded when it is a number, nullif(...), or a bracket
 * holding one. The FORCE RLS tables are read from db/migrations.
 */
import { describe, expect, it } from "vitest";
import { sourcePaths, sourceText } from "@/tests/helpers/source-files";

const FIRST = 157;

/** The SQL without comments, with every string literal emptied. */
function code(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''");
}

function forcedTables(): Set<string> {
  const tables = new Set<string>();
  for (const file of sourcePaths(["db/migrations"], /[.]sql$/)) {
    for (const m of sourceText(file).matchAll(
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?"?(?:public"?\."?)?([a-z_]+)"?\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi,
    )) {
      tables.add(m[1].toLowerCase());
    }
    // 0145 on force RLS in a loop: FOREACH t IN ARRAY ARRAY['a', 'b'] LOOP ... EXECUTE format('ALTER TABLE %I FORCE ...').
    for (const m of sourceText(file).matchAll(
      /FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[([^\]]*)\]\s+LOOP([\s\S]*?)END\s+LOOP/gi,
    )) {
      if (!/FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(m[2])) continue;
      for (const name of m[1].matchAll(/'([a-z_]+)'/gi)) tables.add(name[1].toLowerCase());
    }
  }
  return tables;
}

function run2Files(): string[] {
  return sourcePaths(["db/prod-fixes"], /[.]sql$/).filter((f) => {
    const m = f.match(/db\/prod-fixes\/(\d{4})-[^/]*run2[^/]*\.sql$/);
    return !!m && Number(m[1]) >= FIRST;
  });
}

/** Each INSERT's target table, in order, with where it starts. */
function inserts(sql: string): Array<{ table: string; at: number }> {
  return [...sql.matchAll(/INSERT\s+INTO\s+"?(?:public"?\."?)?([a-z_]+)"?/gi)].map((m) => ({
    table: m[1].toLowerCase(),
    at: m.index ?? 0,
  }));
}

/** The divisor after a "/" at `i`: unguarded unless it's a number, nullif(...), or a bracket holding nullif(. */
function unguardedDivisions(sql: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] !== "/" || sql[i + 1] === "/" || sql[i + 1] === "*" || sql[i - 1] === "*") continue;
    const rest = sql.slice(i + 1).trimStart();
    if (/^\d/.test(rest) || /^nullif\s*\(/i.test(rest)) continue;
    if (rest.startsWith("(")) {
      let depth = 0;
      let end = 0;
      for (; end < rest.length; end++) {
        if (rest[end] === "(") depth++;
        else if (rest[end] === ")" && --depth === 0) break;
      }
      if (/nullif\s*\(/i.test(rest.slice(0, end + 1))) continue;
    }
    out.push(`${sql.slice(Math.max(0, i - 30), i + 1)}${rest.slice(0, 30)}`.replace(/\s+/g, " "));
  }
  return out;
}

describe("run2 backfills into FORCE RLS tables (amendment 107)", () => {
  const forced = forcedTables();
  const files = run2Files();

  it("finds the FORCE RLS tables and the run2 files from 0157 on", () => {
    expect(forced.has("audit_reach_results")).toBe(true);
    expect(forced.has("brand_visibility_scopes")).toBe(true);
    expect(files).toContain("db/prod-fixes/0157-s04-run2-apply.sql");
  });

  it("each starts with the check that the role bypasses RLS, before its first insert into one", () => {
    const missing: string[] = [];
    for (const file of files) {
      const sql = code(sourceText(file));
      const first = inserts(sql).find((i) => forced.has(i.table));
      if (!first) continue;
      const check = sql.search(/rolbypassrls/i);
      const raises = /IF\s+NOT\s*\(\s*SELECT\s+rolbypassrls[\s\S]*?RAISE\s+EXCEPTION/i.test(sql);
      if (check < 0 || check > first.at || !raises) missing.push(file);
    }
    expect(missing).toEqual([]);
  });

  it("each guards every division with nullif", () => {
    const found: string[] = [];
    for (const file of files) {
      const sql = code(sourceText(file));
      if (!inserts(sql).some((i) => forced.has(i.table))) continue;
      for (const d of unguardedDivisions(sql)) found.push(`${file}: ${d}`);
    }
    expect(found).toEqual([]);
  });
});
