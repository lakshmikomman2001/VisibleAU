/**
 * Source-scan guards read the code itself. This reads each root once per test file (the cache lives as long
 * as the module), so a guard with several tests doesn't walk the tree again in each one -- a full walk is
 * what pushed guards past the 5 s unit limit under load. Paths are repo-relative with "/".
 *
 * Every source-scan guard reads through here (regression follow-ups, 9 Nov, part 2): `readSourcesBeforeAll`
 * does the file's one walk in a hook with its own limit, and the tests then read `sourceFiles`,
 * `sourcePaths` and `sourceText` from the cache in milliseconds.
 */
import { type Dirent, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { beforeAll } from "vitest";

export interface SourceFile {
  path: string;
  text: string;
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const lists = new Map<string, readonly string[]>();
const texts = new Map<string, string>();

/**
 * The hook limit for a file's one walk. Warm, app + components + lib (about 780 files, 3.6 MB) take about
 * 60 ms; in the 8 Nov nightly, with 0.65 GB free and the machine paging, a walk inside a test passed the 5 s
 * unit limit (action-center-display-labels). The hook takes the slow part; each test stays milliseconds.
 */
export const SOURCE_SCAN_TIMEOUT_MS = 60_000;

/**
 * Walks `roots` once, before the file's tests, under SOURCE_SCAN_TIMEOUT_MS, and reads every file whose path
 * matches `name` (default: code files).
 */
export function readSourcesBeforeAll(roots: readonly string[], name: RegExp = CODE_FILE): void {
  beforeAll(() => {
    for (const path of listFiles(roots)) if (name.test(path)) sourceText(path);
  }, SOURCE_SCAN_TIMEOUT_MS);
}

function walk(dir: string, out: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = dir === "." ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path, out);
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
}

/**
 * Every file under each repo-relative root (a directory, or a single file), any extension, in directory
 * order; each root listed once. A root that doesn't exist lists nothing.
 */
export function listFiles(roots: readonly string[]): string[] {
  return roots.flatMap((root) => {
    let list = lists.get(root);
    if (!list) {
      const out: string[] = [];
      let isFile = false;
      try {
        isFile = statSync(join(process.cwd(), root)).isFile();
      } catch {
        // Missing: nothing to scan.
      }
      if (isFile) out.push(root);
      else walk(root, out);
      list = out;
      lists.set(root, list);
    }
    return [...list];
  });
}

/** Repo-relative paths of the files under `roots` whose path matches `name` (default .ts and .tsx). */
export function sourcePaths(roots: readonly string[], name: RegExp = /\.tsx?$/): string[] {
  return listFiles(roots).filter((path) => name.test(path));
}

/**
 * The text of one file, repo-relative or absolute: from the cache when it was read before, otherwise read
 * now and kept. Throws if it doesn't exist, as readFileSync does.
 */
export function sourceText(path: string): string {
  const key = (isAbsolute(path) ? relative(process.cwd(), path) : path).replace(/\\/g, "/");
  let text = texts.get(key);
  if (text === undefined) {
    text = readFileSync(join(process.cwd(), key), "utf8");
    texts.set(key, text);
  }
  return text;
}

/** Every code file under each repo-relative root (a directory or a single file), with its text; each read once. */
export function sourceFiles(roots: readonly string[]): SourceFile[] {
  return sourcePaths(roots, CODE_FILE).map((path) => ({ path, text: sourceText(path) }));
}

/** The code that ships or runs outside tests: the app, its libraries, jobs, scripts and the database code. */
export const NON_TEST_ROOTS = [
  "app",
  "components",
  "lib",
  "inngest",
  "scripts",
  "db",
  "cli",
  "middleware.ts",
  "instrumentation.ts",
  "next.config.ts",
] as const;
