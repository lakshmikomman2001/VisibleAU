/**
 * 3 Nov ("The /launch page's hard-coded email gate"). /launch let in exactly one
 * address, compared as a string. Sign-up here needs no verified address
 * (lib/auth/server.ts, requireEmailVerification: false), so whoever registers an
 * address gets a session for it: an address alone proves nothing, and only
 * lib/auth/platform-admin.ts (PLATFORM_ADMIN_EMAILS, a verified address) may
 * decide who an operator is.
 *
 * /launch itself was a static checklist with its checkboxes disabled, from before
 * production existed; nothing linked to it. It's gone, so everyone gets a 404.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

const ROOT = join(__dirname, "../../..");

const SHIPPED_ROOTS = [
  "app",
  "lib",
  "components",
  "middleware.ts",
  "next.config.ts",
  "vercel.json",
];
const SHIPPED_FILE = /\.(tsx?|json)$/;
// One walk per file, cached (tests/helpers/source-files.ts); each test reads the cache.
readSourcesBeforeAll(SHIPPED_ROOTS, SHIPPED_FILE);
const shipped = () => sourcePaths(SHIPPED_ROOTS, SHIPPED_FILE);

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const code = (file: string) => stripComments(sourceText(file));

describe("/launch is gone", () => {
  it("no page or route answers it, so a signed-in account of any kind gets the 404 page", () => {
    expect(existsSync(join(ROOT, "app/(auth)/launch"))).toBe(false);
    const routes = sourcePaths(["app"], /\/(page|route)\.tsx?$/);
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.filter((file) => /\/launch\//.test(file))).toEqual([]);
  });

  it("no catch-all could pick it up", () => {
    const appDirs = readdirSync(join(ROOT, "app"));
    const groups = appDirs.filter((dir) => /^\(.*\)$/.test(dir));
    for (const dir of [".", ...groups]) {
      const entries = readdirSync(join(ROOT, "app", dir));
      expect(entries.filter((entry) => /^\[+\.\.\./.test(entry))).toEqual([]);
    }
  });

  it("nothing links to it", () => {
    expect(shipped().length).toBeGreaterThan(500);
    const linking = shipped().filter((file) => /["'`]\/launch(?:[/"'`?#])/.test(code(file)));
    expect(linking).toEqual([]);
  });
});

describe("no gate compares a hard-coded address", () => {
  it("the old address is nowhere in what ships", () => {
    expect(shipped().filter((file) => code(file).includes("visibleau.local"))).toEqual([]);
  });

  it("no code compares an email to a literal", () => {
    const COMPARES =
      /\.email\b\s*(?:===?|!==?)\s*["'`][^"'`]*@|["'`][^"'`\s]*@[^"'`\s]*["'`]\s*(?:===?|!==?)\s*[\w.?]*\.email\b/;
    expect(shipped().filter((file) => COMPARES.test(code(file)))).toEqual([]);
  });

  it("the one operator check still reads a verified address from the database", () => {
    const check = code("lib/auth/platform-admin.ts");
    expect(check).toContain("PLATFORM_ADMIN_EMAILS");
    expect(check).toMatch(/!authUser\.emailVerified/);
  });
});
