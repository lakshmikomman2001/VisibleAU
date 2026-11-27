/**
 * S04 part 3 (LLD 8.4.2; sprint rule "market-agnostic"): Australia's words -- the country, its states, territories and
 * capitals, "AU" and DataForSEO's Australian location codes -- live only in lib/markets/au.ts. The reach code reads them
 * through lib/markets (Market), so the US launch fills lib/markets/us.ts and changes nothing else. Code only: comments
 * may quote the docs. Later reach files join REACH_CODE as they're added.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path.replace(/\\/g, "/"));
  }
  return out;
}

/** The reach code: everything under lib/reach and lib/markets but Australia's own file, and the engines' table. */
const REACH_CODE = [
  ...files("lib/reach"),
  ...files("lib/markets").filter((f) => f !== "lib/markets/au.ts"),
  "lib/llm/reach-location-params.ts",
  // S04 part 6: the reach card names places only from the API (contract P01.reach: they come from lib/markets).
  "components/domain/brand/reach-card.tsx",
];

const AU_WORDS =
  /\b(Australian?|New South Wales|Victoria|Queensland|Tasmania|Northern Territory|Capital Territory|NSW|VIC|QLD|TAS|ACT|NT|WA|SA|Sydney|Melbourne|Brisbane|Perth|Adelaide|Hobart|Canberra|Darwin)\b|["'`]AU["'`]|\b(2036|2003[4-9]|2004[01])\b/;

const code = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

describe("no Australian words in the reach code outside lib/markets/au.ts", () => {
  it("covers the reach modules", () => {
    for (const f of [
      "lib/reach/generate.ts",
      "lib/reach/templates.ts",
      "lib/reach/places.ts",
      "lib/markets/us.ts",
      "lib/markets/index.ts",
    ])
      expect(REACH_CODE).toContain(f);
    // The pattern finds them where they belong.
    expect(code("lib/markets/au.ts")).toMatch(AU_WORDS);
  });

  it.each(REACH_CODE)("%s", (path) => {
    expect(code(path).match(AU_WORDS)?.[0] ?? null).toBeNull();
  });
});
