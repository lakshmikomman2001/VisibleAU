/**
 * 27 Oct -- Resend received the API key as the from address. The key is read in one
 * place and goes straight into the Resend client: this scan fails on any other read
 * of RESEND_API_KEY in the code that ships, and on the key going anywhere in
 * lib/email/send.ts except `new Resend(...)`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const SCANNED = [
  "app",
  "components",
  "inngest",
  "lib",
  "scripts",
  "middleware.ts",
  "instrumentation.ts",
];
const SENDER = "lib/email/send.ts";

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path)) {
        if (entry !== "node_modules") walk(join(path, entry));
      }
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(path) && !/\.test\.\w+$/.test(path)) {
      out.push(relative(ROOT, path).split(sep).join("/"));
    }
  };
  for (const entry of SCANNED) walk(join(ROOT, entry));
  return out.sort();
}

/** Code without its comments: a name in a comment reads nothing. */
function code(file: string): string {
  return readFileSync(join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** process.env.RESEND_API_KEY, process.env["RESEND_API_KEY"], or destructured from process.env. */
const READ =
  /process\.env(?:\.RESEND_API_KEY\b|\[\s*["'`]RESEND_API_KEY["'`]\s*\])|\{[^}]*\bRESEND_API_KEY\b[^}]*\}\s*=\s*process\.env/g;

describe("RESEND_API_KEY goes into the Resend client and nowhere else", () => {
  // Read once, while the tests are collected: a thousand files read inside a test
  // can outrun the unit project's 5 s limit on a loaded machine.
  const files = sourceFiles();
  const sources = new Map(files.map((file) => [file, code(file)]));
  const source = (file: string) => sources.get(file) ?? "";

  it("found the code it's meant to scan", () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain(SENDER);
  });

  it("only lib/email/send.ts reads it, and only once", () => {
    const reads = files.flatMap((file) => [...source(file).matchAll(READ)].map(() => file));
    expect(reads).toEqual([SENDER]);
  });

  it("there, it goes into new Resend(...) and nothing else", () => {
    const src = source(SENDER);
    const declared = src.match(/const (\w+) = process\.env\.RESEND_API_KEY;/);
    expect(declared, "the key is read into a const").not.toBeNull();
    const name = declared?.[1] ?? "";
    // Its only uses: the read, a test that it's set, and the client constructor.
    const rest = src
      .replace(declared?.[0] ?? "", "")
      .split(`new Resend(${name})`)
      .join("")
      .replace(new RegExp(`return ${name} \\?`), "return ?");
    expect(rest, `${name} is used for something else`).not.toMatch(new RegExp(`\\b${name}\\b`));
  });

  it("there is one Resend client, in lib/email/send.ts", () => {
    const clients = files.filter((file) => /\bnew Resend\(/.test(source(file)));
    expect(clients).toEqual([SENDER]);
  });
});
