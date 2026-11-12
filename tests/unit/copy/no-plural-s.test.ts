/**
 * 13 Nov (Sri's walk-through, part 2): "1 suburb(s)". Text people read says "1 suburb" / "2 suburbs"
 * (lib/format/pluralise.ts), never "suburb(s)". Scans the pages, components and the lib code whose
 * strings reach a page, an API answer or an email; log calls (console.*, which may span lines) and
 * comments are left out, and a call like `test(s)` isn't a plural.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["app", "components", "lib"];

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return /\.(ts|tsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => files(join(path, name).replace(/\\/g, "/")));
}

/** The source without comments and without console.*(...) calls (to their closing parenthesis). */
function withoutLogsAndComments(src: string): string {
  let code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  for (;;) {
    const start = code.search(/console\.(log|warn|error|info|debug)\(/);
    if (start === -1) return code;
    let depth = 0;
    let end = code.indexOf("(", start);
    for (; end < code.length; end++) {
      if (code[end] === "(") depth++;
      else if (code[end] === ")" && --depth === 0) break;
    }
    code = code.slice(0, start) + code.slice(end + 1);
  }
}

/** "brand(s)" after a space, quote, `}` or `>`, not a call such as `.test(s)` or `fn(s) ===`. */
const PLURAL_S = /(?<=[\s}"'`>])[a-z]+\(s\)(?!\s*(?:===|!==|\)|;|\.|=>|\{|,\s*\w+\)))/;

describe("no '(s)' plurals in text people read", () => {
  it("every page, component and lib string", () => {
    const found: string[] = [];
    for (const file of ROOTS.flatMap(files)) {
      for (const line of withoutLogsAndComments(readFileSync(file, "utf8")).split("\n")) {
        if (PLURAL_S.test(line)) found.push(`${file}: ${line.trim()}`);
      }
    }
    expect(found).toEqual([]);
  });
});
