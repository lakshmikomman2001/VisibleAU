/**
 * Rebrand (15 Nov), part 1 -- the guard: the product is Vunnara, and nothing a customer can see says
 * "VisibleAU", "visibleau" or "Visible AU", or draws the old "visible" + "au" wordmark.
 *
 * What it reads: every string a customer could meet -- string literals, template text and JSX text (not comments,
 * not identifiers) in the app, its components and libraries, the jobs, the middleware and the Next config, and
 * the two scripts that name the Stripe products a customer pays for; and every text file the site serves or
 * builds from (public/, the app's own .svg/.txt/.xml/.json files, and app/*.css outside comments). The icons
 * and the share image are drawn from lib/brand.ts (tests/unit/brand/brand-assets.test.ts).
 *
 * The internal names that stay, each with why: ALLOWED below. Fix a finding; don't widen the list unless the
 * name is truly internal, and say why on its entry.
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { listFiles, readSourcesBeforeAll, sourceText } from "../../helpers/source-files";

/** "VisibleAU", "visibleau", "Visible AU", "visible-au", "visibleau_app" -- not "visible audit". */
const OLD_NAME = /(?<![a-z])visible[\s_.-]?au(?![a-z])/i;
/** The old wordmark drew "visible" and "au" as two pieces of JSX text. */
const WORDMARK_PIECE = /^\s*visible\s*$/i;

const CODE_ROOTS = [
  "app",
  "components",
  "lib",
  "inngest",
  "middleware.ts",
  "next.config.ts",
  "scripts/setup-stripe-products.ts",
  "scripts/stripe/ensure-sandbox-prices.ts",
] as const;
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const ASSET_ROOTS = ["public", "app"] as const;
const TEXT_ASSET = /\.(svg|txt|xml|json|webmanifest|html|js|css)$/;

/**
 * The old name where it stays, by file and the exact text: each is an internal identifier no customer sees, or
 * a compatibility path that must keep answering.
 */
const ALLOWED: ReadonlyArray<{ file: string; text: string; why: string }> = [
  {
    file: "lib/inngest/client.ts",
    text: "visibleau",
    why: "the Inngest app id: a new id is a new Inngest app -- its function history is left behind, it needs a fresh sync, and runs in flight under the old id fail",
  },
  {
    file: "lib/product.ts",
    text: "/visibleau-snippet.js",
    why: "the tracking snippet's old path: sites that installed it still load it (next.config.ts serves the same file there)",
  },
  {
    file: "lib/brands/brands-changed.ts",
    text: "visibleau:brands-changed",
    why: "a browser event the app fires to itself between its own components; never shown",
  },
  {
    file: "lib/governance/pg-rate-limit.ts",
    text: "visibleau-default-salt-set-RATE_LIMIT_IP_SALT",
    why: "the salt hashed into rate-limit keys when RATE_LIMIT_IP_SALT isn't set: changing it changes every key; never shown",
  },
  {
    file: "scripts/stripe/ensure-sandbox-prices.ts",
    text: "VisibleAU ",
    why: "finds a Stripe product still under its old name until Sri renames it in the dashboard, so the script never creates a duplicate",
  },
];

interface Finding {
  file: string;
  line: number;
  text: string;
}

/** Every string a customer could see in a code file: literals, template pieces and JSX text, with its line. */
function visibleStrings(
  file: string,
  code: string,
): Array<{ text: string; line: number; jsx: boolean }> {
  const source = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: Array<{ text: string; line: number; jsx: boolean }> = [];
  const visit = (node: ts.Node) => {
    const line = () => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      out.push({ text: node.text, line: line(), jsx: false });
    } else if (ts.isJsxText(node)) {
      out.push({ text: node.text, line: line(), jsx: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const allowed = (file: string, text: string) =>
  ALLOWED.some(
    (a) => a.file === file && text.includes(a.text) && !OLD_NAME.test(text.replace(a.text, "")),
  );

readSourcesBeforeAll(CODE_ROOTS, CODE_FILE);
readSourcesBeforeAll(ASSET_ROOTS, TEXT_ASSET);

function codeFindings(): Finding[] {
  const findings: Finding[] = [];
  for (const file of listFiles(CODE_ROOTS).filter((f) => CODE_FILE.test(f))) {
    for (const s of visibleStrings(file, sourceText(file))) {
      const old = OLD_NAME.test(s.text) && !allowed(file, s.text);
      const piece = s.jsx && WORDMARK_PIECE.test(s.text);
      if (old || piece) findings.push({ file, line: s.line, text: s.text.trim().slice(0, 120) });
    }
  }
  return findings;
}

function assetFindings(): Finding[] {
  const findings: Finding[] = [];
  const files = listFiles(ASSET_ROOTS).filter(
    (f) => TEXT_ASSET.test(f) && (f.startsWith("public/") || !CODE_FILE.test(f)),
  );
  for (const file of files) {
    let text = sourceText(file);
    if (file.endsWith(".css"))
      text = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    text.split("\n").forEach((content, i) => {
      if (OLD_NAME.test(content) && !allowed(file, content))
        findings.push({ file, line: i + 1, text: content.trim().slice(0, 120) });
    });
  }
  return findings;
}

describe("no customer sees the old name", () => {
  it("no string, template or JSX text in the app, its jobs or the Stripe scripts says VisibleAU or draws its wordmark", () => {
    const files = listFiles(CODE_ROOTS).filter((f) => CODE_FILE.test(f));
    // The scan is real: the app has hundreds of code files.
    expect(files.length).toBeGreaterThan(500);
    expect(codeFindings()).toEqual([]);
  }, 60_000);

  it("no file the site serves or builds from says it (public/, app/'s .svg/.txt/.xml/.json, CSS outside comments)", () => {
    expect(listFiles(["public"]).length).toBeGreaterThan(0);
    expect(assetFindings()).toEqual([]);
  });

  it("every allowed entry is still there, with its reason (a stale entry would hide a new finding)", () => {
    for (const entry of ALLOWED) {
      expect(entry.why.length, entry.file).toBeGreaterThan(20);
      const strings = visibleStrings(entry.file, sourceText(entry.file)).map((s) => s.text);
      expect(
        strings.some((s) => s.includes(entry.text)),
        `${entry.file}: "${entry.text}"`,
      ).toBe(true);
    }
  });

  it("catches each way the old name was written", () => {
    const sample = (code: string) =>
      visibleStrings("sample.tsx", code).filter(
        (s) => OLD_NAME.test(s.text) || (s.jsx && WORDMARK_PIECE.test(s.text)),
      ).length;
    expect(sample('const a = "Welcome to VisibleAU!";')).toBe(1);
    expect(sample(`const a = "visibleau-audit-" + n + ".csv";`)).toBe(1);
    expect(sample('const a = "Visible AU";')).toBe(1);
    expect(sample("const a = <span>Visible<span>AU</span></span>;")).toBe(1);
    expect(sample("const a = <span>\n  visible\n</span>;")).toBe(1);
    // Not the old name: a comment, an identifier, a CSS value, "visible audit", the badge's "Visible on AI".
    expect(sample("// VisibleAU\nconst visibleauCount = 1;")).toBe(0);
    expect(sample('const a = { visibility: "visible" }; const b = "a visible audit";')).toBe(0);
    expect(sample('const a = "<text>Visible on AI</text>";')).toBe(0);
  });
});
