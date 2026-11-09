/**
 * The shared reader every source-scan guard uses (tests/helpers/source-files.ts): one walk per file, each
 * file read once, and LF whatever the checkout's line endings (9 Nov, parts 2 and 3).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { listFiles, sourcePaths, sourceText } from "../../helpers/source-files";

const dir = mkdtempSync(join(tmpdir(), "source-files-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("sourceText", () => {
  it('reads a CRLF file as LF, so a cut at "\\n}\\n" lands on any checkout', () => {
    const file = join(dir, "crlf.ts");
    writeFileSync(file, "export function a() {\r\n  return 1;\r\n}\r\nexport const b = 2;\r\n");
    const text = sourceText(file);
    expect(text).not.toContain("\r");
    expect(text.slice(0, text.indexOf("\n}\n"))).toBe("export function a() {\n  return 1;");
  });

  it("reads each file once: a change on disk after the first read isn't seen", () => {
    const file = join(dir, "once.ts");
    writeFileSync(file, "first");
    expect(sourceText(file)).toBe("first");
    writeFileSync(file, "second");
    expect(sourceText(file)).toBe("first");
  });

  it("throws for a file that doesn't exist, as readFileSync does", () => {
    expect(() => sourceText(join(dir, "missing.ts"))).toThrow(/ENOENT/);
  });
});

describe("listFiles and sourcePaths", () => {
  it("list a root's files repo-relative with '/', skip node_modules, and keep a missing root empty", () => {
    const files = listFiles(["lib/scoring"]);
    expect(files).toContain("lib/scoring/measured.ts");
    expect(files.every((f) => f.startsWith("lib/scoring/") && !f.includes("\\"))).toBe(true);
    expect(listFiles(["no-such-root"])).toEqual([]);
    expect(sourcePaths(["vercel.json"], /\.json$/)).toEqual(["vercel.json"]);
    expect(sourcePaths(["vercel.json"])).toEqual([]);
  });
});
