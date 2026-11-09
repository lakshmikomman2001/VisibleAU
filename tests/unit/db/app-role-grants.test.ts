/**
 * Team follow-ups (7 Nov), item 9: the local databases get exactly the grants production got from prod-fix
 * 0052. scripts/db/app-role-grants.ts runs them on every `pnpm db:migrate:local`, and the integration setup
 * checks them; this keeps its copy word for word the same as 0052's, so the two can't drift apart.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROLE_FORCE_RLS, APP_ROLE_GRANTS } from "@/scripts/db/app-role-grants";

const PROD_FIX = readFileSync(
  join(__dirname, "../../../db/prod-fixes/0052-app-role-apply-prod.sql"),
  "utf8",
);

/** Comments out, whitespace collapsed, whatever the checkout's line endings (a "--" comment ran to "\r"). */
function normalise(sql: string): string {
  return sql
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every GRANT and ALTER DEFAULT PRIVILEGES statement in 0052, without its semicolon. */
function grantStatements(sql: string): string[] {
  return normalise(sql)
    .split(";")
    .map((s) => s.trim())
    .filter((s) => /^(GRANT|ALTER DEFAULT PRIVILEGES)\b/.test(s));
}

describe("the local app-role grants are production's (prod-fix 0052)", () => {
  it("grants exactly 0052's GRANT and ALTER DEFAULT PRIVILEGES statements, in its order", () => {
    expect(grantStatements(PROD_FIX)).toEqual([...APP_ROLE_GRANTS]);
  });

  it("forces row-level security with 0052's own loop", () => {
    expect(normalise(PROD_FIX)).toContain(normalise(APP_ROLE_FORCE_RLS));
  });

  it("reads 0052 the same from a CRLF checkout", () => {
    const crlf = PROD_FIX.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
    expect(normalise(crlf)).toBe(normalise(PROD_FIX));
    expect(grantStatements(crlf)).toEqual([...APP_ROLE_GRANTS]);
  });
});
