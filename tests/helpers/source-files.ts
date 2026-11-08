/**
 * Source-scan guards read the code itself. This reads each root once per test file (the cache lives as long
 * as the module), so a guard with several tests doesn't walk the tree again in each one -- a full walk is
 * what pushed guards past the 5 s unit limit under load. Paths are repo-relative with "/".
 */
import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface SourceFile {
  path: string;
  text: string;
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const cache = new Map<string, readonly SourceFile[]>();

function walk(dir: string, out: SourceFile[]): void {
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
    } else if (entry.isFile() && CODE_FILE.test(entry.name)) {
      out.push({ path, text: readFileSync(join(process.cwd(), path), "utf8") });
    }
  }
}

/** Every code file under each repo-relative root (a directory or a single file), each root read once. */
export function sourceFiles(roots: readonly string[]): SourceFile[] {
  return roots.flatMap((root) => {
    const cached = cache.get(root);
    if (cached) return [...cached];
    const files: SourceFile[] = [];
    if (CODE_FILE.test(root)) {
      try {
        files.push({ path: root, text: readFileSync(join(process.cwd(), root), "utf8") });
      } catch {
        // A root file that doesn't exist has nothing to scan.
      }
    } else {
      walk(root, files);
    }
    cache.set(root, files);
    return [...files];
  });
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
