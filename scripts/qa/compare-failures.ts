/**
 * Compares the failures in saved vitest outputs with tests/known-failures.txt, by test name (CLAUDE.md,
 * Testing scope 6). A count doesn't say whether a run broke something: a `vitest related` run fails only the
 * part of the baseline it selects, so 18, 20 and 29 can each be "nothing new" -- or not.
 *
 *   npx tsx scripts/qa/compare-failures.ts <vitest output> [more outputs]
 *
 * Reads the " FAIL  |project| file > describe > test" lines vitest's default reporter prints in its summary,
 * and prints the failures in the baseline, any that aren't (new), and any in the known flake's file. Exits 1
 * when there's a new failure.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BASELINE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../tests/known-failures.txt",
);

// biome-ignore lint/suspicious/noControlCharactersInRegex: the escape character is what it strips.
const ANSI = /\u001b\[[0-9;]*m/g;

export interface Baseline {
  /** "file > describe > test", one per known failure. */
  tests: Set<string>;
  /** Files whose failures are a known flake ("flaky: <file>"). */
  flakyFiles: string[];
}

export function readBaseline(text: string): Baseline {
  const tests = new Set<string>();
  const flakyFiles: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("flaky:")) flakyFiles.push(line.slice("flaky:".length).trim());
    // A known failure carries its reason after "  # " (9 Nov); the name is what comes before it.
    else tests.add(line.replace(/\s+#\s.*$/, ""));
  }
  return { tests, flakyFiles };
}

/** Each failed test in a vitest output, once, without its project label. */
export function failuresIn(output: string): string[] {
  const failed = new Set<string>();
  for (const raw of output.split(/\r?\n/)) {
    const match = raw.replace(ANSI, "").match(/^\s*FAIL\s+(?:\|[^|]*\|\s+)?(.*\S)\s*$/);
    if (match) failed.add(match[1]);
  }
  return [...failed].sort();
}

/**
 * Playwright-run follow-ups (9 Nov), part 6 -- the Playwright baseline, compared the same way, by name.
 * Each failure in a Playwright "list" output, as "<spec path> > <describe> > <test>": its numbered entry in
 * the summary ("  1) [chromium] › tests\e2e\x.spec.ts:12:3 › describe › test"), path with "/" and no line.
 */
export const E2E_BASELINE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../tests/e2e/known-failures.txt",
);

export function playwrightFailuresIn(output: string): string[] {
  const failed = new Set<string>();
  for (const raw of output.split(/\r?\n/)) {
    const match = raw
      .replace(ANSI, "")
      .match(/^\s*\d+\) \[[^\]]+\] › ([^:]+\.spec\.ts):\d+:\d+ › (.*\S)\s*$/);
    if (match) failed.add(`${match[1].replace(/\\/g, "/")} > ${match[2].split(" › ").join(" > ")}`);
  }
  return [...failed].sort();
}

export interface Comparison {
  known: string[];
  flaky: string[];
  new: string[];
}

export function compareWithBaseline(failures: string[], baseline: Baseline): Comparison {
  const result: Comparison = { known: [], flaky: [], new: [] };
  for (const test of failures) {
    if (baseline.tests.has(test)) result.known.push(test);
    else if (baseline.flakyFiles.some((file) => test === file || test.startsWith(`${file} `))) {
      result.flaky.push(test);
    } else result.new.push(test);
  }
  return result;
}

function main(args: string[]): number {
  // --e2e: Playwright outputs, against tests/e2e/known-failures.txt.
  const e2e = args.includes("--e2e");
  const paths = args.filter((a) => a !== "--e2e");
  if (paths.length === 0) {
    console.error(
      "Usage: npx tsx scripts/qa/compare-failures.ts [--e2e] <vitest or Playwright output> [more outputs]",
    );
    return 2;
  }
  const baselineFile = e2e ? "tests/e2e/known-failures.txt" : "tests/known-failures.txt";
  const baseline = readBaseline(readFileSync(e2e ? E2E_BASELINE_PATH : BASELINE_PATH, "utf8"));
  const parse = e2e ? playwrightFailuresIn : failuresIn;
  const failures = [...new Set(paths.flatMap((path) => parse(readFileSync(path, "utf8"))))].sort();
  const result = compareWithBaseline(failures, baseline);
  console.log(
    `${failures.length} failed: ${result.known.length} in the baseline (of ${baseline.tests.size}), ` +
      `${result.new.length} new, ${result.flaky.length} in the known flake's file.`,
  );
  const sections: Array<[string, string[]]> = [
    [`New (not in ${baselineFile}):`, result.new],
    ["Known flake (re-run its file alone, up to 3 times):", result.flaky],
    ["In the baseline:", result.known],
  ];
  for (const [title, tests] of sections) {
    if (tests.length === 0) continue;
    console.log(`\n${title}`);
    for (const test of tests) console.log(`  ${test}`);
  }
  return result.new.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
