/**
 * Engine-failure follow-ups (1 Nov), item 1 -- the failure-message
 * patterns have one source of truth, lib/llm/failure-patterns.ts. The
 * diag SQL can't import it (it's pasted into the Neon editor), so this
 * checks the SQL carries exactly the same strings, in the same order.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FAILURE_PATTERN_SQL_CATEGORIES,
  FAILURE_PATTERNS,
  type FailurePatternKey,
} from "@/lib/llm/failure-patterns";

const DIAG = readFileSync(
  join(process.cwd(), "db/prod-fixes/diag-0108-audit37-engine-failures.sql"),
  "utf8",
);

/** message_category's CASE: category label -> pattern, in the order they're checked. */
function caseCategories(sql: string): Array<{ category: string; pattern: string }> {
  return [...sql.matchAll(/WHEN f\.error_message ~\* '([^']+)'\s+THEN '([^']+)'/g)].map((m) => ({
    pattern: m[1],
    category: m[2],
  }));
}

/** Query 5's bool_or columns: alias -> pattern. */
function boolOrColumns(sql: string): Map<string, string> {
  return new Map(
    [...sql.matchAll(/bool_or\(f\.error_message ~\* '([^']+)'\)\s+AS (\w+)/g)].map((m) => [
      m[2],
      m[1],
    ]),
  );
}

const KEYS = Object.keys(FAILURE_PATTERNS) as FailurePatternKey[];

describe("the diag SQL and lib/llm/failure-patterns.ts agree (1 Nov, item 1)", () => {
  it("message_category has every pattern, character for character", () => {
    const sqlCases = caseCategories(DIAG);
    for (const key of KEYS) {
      const row = sqlCases.find((c) => c.category === FAILURE_PATTERN_SQL_CATEGORIES[key]);
      expect(row, `no '${FAILURE_PATTERN_SQL_CATEGORIES[key]}' in diag-0108`).toBeDefined();
      expect(row?.pattern, key).toBe(FAILURE_PATTERNS[key]);
    }
  });

  it("in the same order: spend limit first, then credit, key, permission, model", () => {
    const order = caseCategories(DIAG)
      .map((c) => c.category)
      .filter((c) => Object.values(FAILURE_PATTERN_SQL_CATEGORIES).includes(c));
    expect(order).toEqual(KEYS.map((k) => FAILURE_PATTERN_SQL_CATEGORIES[k]));
  });

  it("query 5's columns use the same strings", () => {
    const columns = boolOrColumns(DIAG);
    const expected: Record<string, FailurePatternKey> = {
      any_spend_limit_message: "spendLimit",
      any_credit_or_quota_message: "creditOrQuota",
      any_key_message: "authentication",
      any_model_message: "modelNotFound",
    };
    for (const [alias, key] of Object.entries(expected)) {
      expect(columns.get(alias), alias).toBe(FAILURE_PATTERNS[key]);
    }
  });

  it("every pattern is safe to paste into SQL and compiles in JavaScript", () => {
    for (const key of KEYS) {
      const source = FAILURE_PATTERNS[key];
      expect(source, key).not.toMatch(/['\\]/);
      expect(() => new RegExp(source, "i"), key).not.toThrow();
    }
  });
});
