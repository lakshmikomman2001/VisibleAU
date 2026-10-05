/**
 * ⚠️ TTT — confirms the audit detail page's Responses tab actually wires
 * through dedupeResponses (not a hardcoded "5", not a one-off reimplementation)
 * and no longer unconditionally labels every row "Run N" once replays exist.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("⚠️ TTT — audit detail page: Responses tab wiring", () => {
  const src = readFileSync("app/(auth)/audits/[auditId]/page.tsx", "utf8");

  it("imports and calls the shared dedupeResponses, not an inline reimplementation", () => {
    expect(src).toMatch(
      /import\s*\{\s*dedupeResponses\s*\}\s*from\s*"@\/lib\/audit\/dedupe-responses"/,
    );
    expect(src).toMatch(/const rows = dedupeResponses\(rawRows\);/);
  });

  it("orders by (engine, prompt, runNumber) so a replay group can't be split across a page boundary", () => {
    expect(src).toMatch(
      /\.orderBy\(citations\.engine,\s*citations\.prompt,\s*citations\.runNumber\)/,
    );
  });

  it("'Run N' is shown only when replicaCount is 1 -- never unconditionally once replays exist", () => {
    expect(src).not.toMatch(/\{\s*`Run \$\{c\.runNumber\}`\s*\}\s*<\/span>/);
    expect(src).toMatch(/c\.replicaCount > 1/);
    expect(src).toMatch(/`Run \$\{c\.runNumber\}`/);
  });

  it("computes a real distinct-response count via SQL, scoped to the whole audit", () => {
    expect(src).toMatch(
      /COUNT\(DISTINCT \(\$\{citations\.engine\}, \$\{citations\.prompt\}, \$\{citations\.responseSnippet\}\)\)/,
    );
    expect(src).toMatch(/distinctResponseCount/);
  });

  it("the in-tab summary line states the distinct count, not just the replay-inflated total", () => {
    expect(src).toMatch(/distinct real responses/);
    expect(src).toMatch(/responsesData\.distinctResponseCount/);
  });
});
