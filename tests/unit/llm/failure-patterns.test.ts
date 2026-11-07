/**
 * Engine-failure follow-ups (1 Nov), item 1 -- the failure-message
 * patterns have one source of truth, lib/llm/failure-patterns.ts. The
 * diag SQL can't import it (it's pasted into the Neon editor), so this
 * checks the SQL carries exactly the same strings, in the same order.
 *
 * 2 Nov: message_category's CASE is generated from those patterns
 * (failureCategorySqlCase), including the new branches -- a 429's own type
 * or code (out of quota, then rate limit) before the message's words. The
 * same samples are run through PostgreSQL in
 * tests/integration/rate-limit-label.integration.test.tsx.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FAILURE_PATTERN_ORDER,
  FAILURE_PATTERN_SQL_CATEGORIES,
  FAILURE_PATTERNS,
  type FailurePatternKey,
  failureCategorySqlCase,
  failureMessageCategory,
} from "@/lib/llm/failure-patterns";
import { FAILURE_MESSAGE_SAMPLES } from "@/tests/helpers/failure-message-samples";

const DIAG = readFileSync(
  join(process.cwd(), "db/prod-fixes/diag-0108-audit37-engine-failures.sql"),
  "utf8",
);

function squash(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

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

describe("the diag SQL and lib/llm/failure-patterns.ts agree (1 Nov, item 1; 2 Nov)", () => {
  it("message_category is exactly the CASE generated from the shared patterns", () => {
    expect(squash(DIAG)).toContain(
      squash(`${failureCategorySqlCase("f.error_message")} AS message_category`),
    );
  });

  it("every pattern is in it, character for character, in the shared order -- the 429 type branches between the spend limit and the message's words", () => {
    const order = caseCategories(DIAG)
      .filter((c) => Object.values(FAILURE_PATTERN_SQL_CATEGORIES).includes(c.category))
      .map((c) => c.category);
    expect(order).toEqual(FAILURE_PATTERN_ORDER.map((k) => FAILURE_PATTERN_SQL_CATEGORIES[k]));
    expect(FAILURE_PATTERN_ORDER.slice(0, 5)).toEqual([
      "spendLimit",
      "dailySearchLimit",
      "quotaOn429",
      "rateLimitOn429",
      "creditOrQuota",
    ]);
    for (const key of FAILURE_PATTERN_ORDER) {
      const row = caseCategories(DIAG).find(
        (c) => c.category === FAILURE_PATTERN_SQL_CATEGORIES[key],
      );
      expect(row?.pattern, key).toBe(FAILURE_PATTERNS[key]);
    }
  });

  it("query 5's columns use the same strings", () => {
    const columns = boolOrColumns(DIAG);
    const expected: Record<string, FailurePatternKey> = {
      any_spend_limit_message: "spendLimit",
      any_quota_429_type: "quotaOn429",
      any_rate_limit_429_type: "rateLimitOn429",
      any_credit_or_quota_message: "creditOrQuota",
      any_key_message: "authentication",
      any_model_message: "modelNotFound",
    };
    for (const [alias, key] of Object.entries(expected)) {
      expect(columns.get(alias), alias).toBe(FAILURE_PATTERNS[key]);
    }
  });

  it("every pattern is safe to paste into SQL and compiles in JavaScript", () => {
    for (const key of FAILURE_PATTERN_ORDER) {
      const source = FAILURE_PATTERNS[key];
      expect(source, key).not.toMatch(/['\\]/);
      expect(() => new RegExp(source, "i"), key).not.toThrow();
    }
  });
});

describe("each stored message's category (2 Nov)", () => {
  for (const s of FAILURE_MESSAGE_SAMPLES) {
    it(s.name, () => {
      expect(failureMessageCategory(s.message ?? "")).toBe(s.category);
    });
  }

  it("a 429's type is read only before its colon: the provider's sentence can't decide it", () => {
    expect(
      failureMessageCategory("HTTP 429: Rate limit exceeded. RESOURCE_EXHAUSTED, slow down."),
    ).toBeNull();
    expect(failureMessageCategory("HTTP 400 invalid_request_error: rate_limit_exceeded")).toBe(
      null,
    );
  });
});
