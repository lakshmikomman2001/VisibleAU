/**
 * No arbitrary "first brand" (7 Nov, Sri's decision 3) -- a query that keeps ONE brand (`.limit(1)`, or
 * `const [brand] = await ...`) must say which: a brand id (or the brand's unique token) in its filter, or
 * a deterministic ORDER BY. The Overview's Autopilot tracker and persona sections used to show whichever
 * row Postgres returned first (a LIMIT 1 with no ORDER BY); aggregates (count()) return one row by nature
 * and are exempt.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = execFileSync("git", ["ls-files", "lib", "app", "components", "inngest"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f));

const NAMES_ONE_BRAND = /(eq|inArray)\(\s*brands\.(id|brandToken)\b/;

/** Every brand query that keeps one row without naming the brand or ordering the rows. */
function arbitraryPicks(text: string): number[] {
  const lines: number[] = [];
  for (const m of text.matchAll(/\.from\(brands\)/g)) {
    const index = m.index ?? 0;
    const before = text.slice(Math.max(0, index - 600), index);
    const start = Math.max(
      before.lastIndexOf(";"),
      before.lastIndexOf("{\n"),
      before.lastIndexOf("=>"),
    );
    const head = before.slice(start + 1);
    const end = text.indexOf(";", index);
    const tail = text.slice(index, end === -1 ? index + 600 : end);
    const keepsOne = /\.limit\(1\)/.test(tail) || /const \[\s*\w+\s*\]\s*=\s*await/.test(head);
    if (!keepsOne) continue;
    if (/\bcount\(\)/.test(head)) continue;
    if (NAMES_ONE_BRAND.test(head + tail) || /\.orderBy\(/.test(tail)) continue;
    lines.push(text.slice(0, index).split("\n").length);
  }
  return lines;
}

describe("no arbitrary first brand", () => {
  it("every query that keeps one brand names it or orders the rows", () => {
    const offenders = files.flatMap((f) =>
      arbitraryPicks(readFileSync(f, "utf8")).map((line) => `${f}:${line}`),
    );
    expect(offenders).toEqual([]);
  });

  it("catches the shape the Overview used to have, and lets a named or ordered query through", () => {
    const unordered =
      "const [firstBrand] = await tx\n  .select({ id: brands.id })\n  .from(brands)\n  .where(eq(brands.organizationId, orgId))\n  .limit(1);";
    expect(arbitraryPicks(unordered)).toEqual([3]);
    expect(
      arbitraryPicks(unordered.replace(".limit(1)", ".orderBy(brands.name).limit(1)")),
    ).toEqual([]);
    expect(
      arbitraryPicks(
        unordered.replace("eq(brands.organizationId, orgId)", "eq(brands.id, brandId)"),
      ),
    ).toEqual([]);
  });

  it("the brand list API is ordered, so a picker's default is never the row that came first", () => {
    const route = readFileSync("app/api/brands/route.ts", "utf8");
    const get = route.slice(
      route.indexOf("export async function GET"),
      route.indexOf("export async function POST"),
    );
    expect(get).toMatch(/\.orderBy\(asc\(brands\.name\), asc\(brands\.id\)\)/);
  });
});
