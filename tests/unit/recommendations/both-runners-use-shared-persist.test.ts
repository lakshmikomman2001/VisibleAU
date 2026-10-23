import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "The Action Center shows each brand's latest audit only" (23 Oct),
 * item 1 -- "both runners behave the same" as an enforced fact, not
 * just a one-time read of the source. Before this task, each of the
 * two real-audit recommendation writers (inngest/functions/generate-
 * recommendations.ts, lib/audit/run-audit-inline.ts) had its own
 * inline `.insert(actionItems).values(...).onConflictDoNothing()` --
 * already proven to drift once (lib/audit/run-audit-inline.ts was
 * missing confidenceBasis entirely until the 21 Oct hotfix, even
 * though the Inngest function had it). Both now call the ONE shared
 * lib/recommendations/persist.ts::persistRecommendations instead of
 * writing to action_items directly, so the dismiss-old-opens /
 * skip-if-in-progress rules live in exactly one place. This test fails
 * loudly if either file is ever changed back to its own inline insert.
 */
const REPO_ROOT = path.resolve(__dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf-8");
}

describe("both recommendation-persisting runners call the shared persistRecommendations helper", () => {
  it("inngest/functions/generate-recommendations.ts calls persistRecommendations, not its own insert", () => {
    const source = read("inngest/functions/generate-recommendations.ts");
    expect(source).toMatch(/persistRecommendations\(/);
    expect(source).not.toMatch(/\.insert\(actionItems\)/);
  });

  it("lib/audit/run-audit-inline.ts calls persistRecommendations, not its own insert", () => {
    const source = read("lib/audit/run-audit-inline.ts");
    expect(source).toMatch(/persistRecommendations\(/);
    expect(source).not.toMatch(/\.insert\(actionItems\)/);
  });

  it("both import persistRecommendations from the one shared module", () => {
    const generate = read("inngest/functions/generate-recommendations.ts");
    const inline = read("lib/audit/run-audit-inline.ts");
    expect(generate).toMatch(/from ["']@\/lib\/recommendations\/persist["']/);
    expect(inline).toMatch(/from ["']@\/lib\/recommendations\/persist["']/);
  });
});
