import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Audit #36 follow-up -- grep guards for the retired 0-100 Position and
 * Source-citation scores.
 *
 * Position's score was max(0, 1 - (median - 1) / 50) * 100
 * (positionDimensionScore, lib/scoring/position.ts): the /50 had no
 * documented or measured basis. Nothing outside tests may compute it
 * again -- lib/scoring/position.ts stays only for its own historical
 * tests. Recommendation rules read the measured counts (TriggerContext.
 * mentionDetail), never a 0-100 Position or Source-citation value.
 *
 * Walks the directories on disk (not git ls-files), so a new, not yet
 * committed file is checked too.
 */
const repoRoot = path.resolve(__dirname, "../../..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...sourceFiles(rel));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/** Doc comments explain these rules in prose -- only code counts. */
function code(rel: string): string {
  const source = readFileSync(path.join(repoRoot, rel), "utf-8");
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

const APP_DIRS = ["app", "components", "lib", "inngest", "scripts"];

describe("the 0-100 Position score is never computed outside tests", () => {
  it("no non-test file imports or calls positionDimensionScore, or rebuilds its /50 scale", () => {
    const offenders: string[] = [];
    for (const dir of APP_DIRS) {
      for (const rel of sourceFiles(dir)) {
        if (rel === "lib/scoring/position.ts") continue;
        const src = code(rel);
        if (
          /positionDimensionScore/.test(src) ||
          /["']@\/lib\/scoring\/position["']/.test(src) ||
          /["']\.\/position["']/.test(src) ||
          /MAX_POSITION/.test(src)
        ) {
          offenders.push(rel);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("recommendation triggers read measured counts, never a 0-100 Position or Source score", () => {
  it("no file in lib/recommendations reads a stored or computed Position/Source score", () => {
    const offenders: string[] = [];
    for (const rel of sourceFiles("lib/recommendations")) {
      const src = code(rel);
      if (
        /scorePosition|scoreAccuracy|score_position|score_accuracy/.test(src) ||
        /positionDimensionScore|accuracyDimensionScore/.test(src) ||
        /["']@\/lib\/scoring\/(position|accuracy)["']/.test(src) ||
        /\.(position|accuracy)\.value/.test(src)
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the trigger context has no Position or Source score fields", () => {
    const types = code("lib/recommendations/types.ts");
    const context = types.slice(types.indexOf("interface TriggerContext"));
    const body = context.slice(0, context.indexOf("}"));
    expect(body).not.toMatch(/scorePosition|scoreAccuracy/);
    expect(body).toMatch(/mentionDetail: MentionDetailCounts \| null/);
  });
});
