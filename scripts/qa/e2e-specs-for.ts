/**
 * Which Playwright specs a change can break. `vitest related` never selects them, so a copy or route change
 * broke an e2e spec unnoticed (9 Nov: 3176980 changed the invite banner's masking; the session spec still
 * expected the old text). CLAUDE.md, Testing scope 2: after a UI copy or route change, run this and run the
 * specs it lists, one file at a time, if 6 GB is free; otherwise name them in the report as "not run".
 *
 *   npx tsx scripts/qa/e2e-specs-for.ts <changed file> [more files] [--base <git ref>]
 *
 * With no files it takes what `git diff --name-only <base>` lists (default base HEAD: the uncommitted change;
 * `--base HEAD~1` for the last commit). A spec is listed when it
 * - imports a changed file, directly or through a helper under tests/;
 * - names the route a changed page, route handler or layout serves ("/settings/team", "/brands/${id}/reports");
 * - contains a visible string that a changed .tsx file's diff adds or removes (a JSX text or a string literal
 *   of two words or more).
 * Each spec is printed with its config and why it was listed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface SpecMatch {
  spec: string;
  config: string;
  reasons: string[];
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "_archive"]);

/** Every Playwright spec: tests/e2e and tests/qa, never an archived one. Repo-relative, "/" separators. */
export function listSpecs(root = REPO_ROOT): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(join(root, dir));
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const path = `${dir}/${name}`;
      if (statSync(join(root, path)).isDirectory()) walk(path);
      else if (/\.spec\.ts$/.test(name)) out.push(path);
    }
  };
  walk("tests/e2e");
  walk("tests/qa");
  return out.sort();
}

/** The config a spec runs under: its folder's, or the root one for tests/e2e/0N-*.spec.ts. */
export function configFor(spec: string): string {
  const folder = spec.match(/^(tests\/(?:e2e|qa)\/[^/]+)\//)?.[1];
  if (folder && existsSync(join(REPO_ROOT, folder, "playwright.config.ts"))) {
    return `${folder}/playwright.config.ts`;
  }
  return "playwright.config.ts";
}

/** "app/(auth)/brands/[brandId]/reports/page.tsx" -> "/brands/[brandId]/reports"; null if it serves no route. */
export function routeOf(file: string): string | null {
  const m = file.match(/^app\/(.*?)\/?(page|route|layout)\.(tsx?|jsx?)$/);
  if (!m) return null;
  const segments = m[1]
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@") && !s.startsWith("_"));
  return `/${segments.join("/")}`;
}

/**
 * How a spec names the route: each dynamic segment is any one path segment ("abc", "${brandId}"). A layout
 * also covers everything under it. Matches only a whole path: "/brands" doesn't match "/brands-list".
 */
export function routePattern(route: string, { prefix = false } = {}): RegExp {
  const parts = route
    .split("/")
    .filter(Boolean)
    .map((s) =>
      /^\[.*\]$/.test(s)
        ? "(?:\\$\\{[^}]+\\}|[^/\"'`?#\\s]+)"
        : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
  const body = parts.length ? `/${parts.join("/")}` : "";
  const end = prefix ? "(?=[/\"'`?#\\s]|$)" : "(?=[\"'`?#\\s]|/?[\"'`?#\\s]|$)";
  return new RegExp(`["'\`]${body}${prefix && !body ? "/" : ""}${end}`);
}

/** Visible-looking strings in some TSX: JSX text and string literals of two words or more. */
export function visibleStrings(text: string): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    const s = raw.replace(/\s+/g, " ").trim();
    if (s.length < 6 || s.length > 160 || !/[a-z]/i.test(s) || !/\s/.test(s)) return;
    // Class lists, imports, URLs and code aren't copy.
    if (/^[\w:/[\]().%-]+(\s[\w:/[\]().%-]+)*$/.test(s) && /[-:]/.test(s) && !/[A-Z]/.test(s[0]))
      return;
    if (/[{}<>=;]|=>|^@\/|^\.{1,2}\/|https?:/.test(s)) return;
    found.add(s);
  };
  for (const m of text.matchAll(/>([^<>{}]+)</g)) add(m[1]);
  for (const m of text.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) add(m[1]);
  for (const m of text.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) add(m[1]);
  for (const m of text.matchAll(/`([^`$\n]*)`/g)) add(m[1]);
  return [...found];
}

function resolveImport(from: string, spec: string, root: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = posix.join(posix.dirname(from), spec);
  else return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    const abs = join(root, candidate);
    if (existsSync(abs) && statSync(abs).isFile()) return candidate;
  }
  return null;
}

/** The files a spec imports, following its helpers under tests/ (app code is a leaf). */
export function importsOf(
  spec: string,
  read: (path: string) => string,
  root = REPO_ROOT,
): Set<string> {
  const seen = new Set<string>();
  const queue = [spec];
  while (queue.length) {
    const file = queue.pop() as string;
    let text: string;
    try {
      text = read(file);
    } catch {
      continue;
    }
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const target = resolveImport(file, m[1], root);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      if (target.startsWith("tests/")) queue.push(target);
    }
  }
  return seen;
}

export interface ChangedFile {
  path: string;
  /** The diff's added and removed lines (or the whole file when it's new). */
  changedText: string;
}

export function specsFor(
  changed: ChangedFile[],
  specs: string[],
  read: (path: string) => string,
  root = REPO_ROOT,
): SpecMatch[] {
  const matches = new Map<string, Set<string>>();
  const add = (spec: string, reason: string) => {
    let set = matches.get(spec);
    if (!set) {
      set = new Set();
      matches.set(spec, set);
    }
    set.add(reason);
  };
  const texts = new Map(specs.map((s) => [s, read(s)]));
  const graphs = new Map(specs.map((s) => [s, importsOf(s, read, root)]));

  for (const file of changed) {
    for (const spec of specs) {
      if (spec === file.path) add(spec, "changed itself");
      else if (graphs.get(spec)?.has(file.path)) add(spec, `imports ${file.path}`);
    }
    const route = routeOf(file.path);
    if (route !== null && route !== "/") {
      const pattern = routePattern(route, { prefix: file.path.includes("/layout.") });
      for (const spec of specs)
        if (pattern.test(texts.get(spec) ?? "")) add(spec, `names ${route}`);
    } else if (route === "/" && !file.path.includes("/layout.")) {
      const pattern = /["'`]\/["'`]/;
      for (const spec of specs) if (pattern.test(texts.get(spec) ?? "")) add(spec, "names /");
    }
    if (/\.(tsx|jsx)$/.test(file.path) || /^(lib|components|app)\//.test(file.path)) {
      for (const str of visibleStrings(file.changedText)) {
        for (const spec of specs) {
          if ((texts.get(spec) ?? "").includes(str)) add(spec, `contains "${str}"`);
        }
      }
    }
  }
  return [...matches.entries()]
    .map(([spec, reasons]) => ({ spec, config: configFor(spec), reasons: [...reasons] }))
    .sort((a, b) => a.spec.localeCompare(b.spec));
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

/** The diff's added and removed lines for a file, or its whole text when git doesn't know it. */
function changedTextOf(path: string, base: string): string {
  try {
    const diff = git(["diff", "--unified=0", base, "--", path]);
    if (diff.trim()) {
      return diff
        .split("\n")
        .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l))
        .map((l) => l.slice(1))
        .join("\n");
    }
  } catch {
    // Not a git path: read it whole.
  }
  try {
    return readFileSync(join(REPO_ROOT, path), "utf8");
  } catch {
    return "";
  }
}

export function main(argv: string[]): number {
  let base = "HEAD";
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") base = argv[++i] ?? base;
    else files.push(argv[i]);
  }
  const changed = (files.length ? files : git(["diff", "--name-only", base]).split("\n"))
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => relative(REPO_ROOT, resolve(REPO_ROOT, f)).replace(/\\/g, "/"))
    .map((path) => ({ path, changedText: changedTextOf(path, base) }));
  const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8").replace(/\r\n/g, "\n");
  const found = specsFor(changed, listSpecs(), read);
  if (found.length === 0) {
    console.log(
      `No Playwright spec imports, names or quotes the ${changed.length} changed file(s).`,
    );
    return 0;
  }
  console.log(`${found.length} Playwright spec(s) to run, one at a time, if 6 GB is free:`);
  for (const m of found) {
    console.log(
      `\n${m.spec}\n  npx playwright test --config ${m.config} ${m.spec.replace(/^.*\//, "")}`,
    );
    for (const r of m.reasons.slice(0, 6)) console.log(`  - ${r}`);
    if (m.reasons.length > 6) console.log(`  - and ${m.reasons.length - 6} more`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
