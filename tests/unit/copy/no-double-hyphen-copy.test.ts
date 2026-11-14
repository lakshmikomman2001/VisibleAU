/**
 * 13 Nov, part 4 (Sri's live check): a generated question read "Plumber in Norwest, NSW -- who do locals trust
 * for general repairs?". " -- " is a code-comment habit, not punctuation. None in what the product shows or
 * asks: the question templates (lib/prompts/templates.ts), the vertical packs (db/seed/verticals), and every
 * string, template or JSX text in shipped code. Comments are not copy; neither are log lines (console.*) or
 * SQL (a tagged template: "--" is its comment). Stored packs regenerate on their next audit or a rename
 * (lib/prompts/generator-version.ts 3); stored audit questions are never rewritten.
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { AU_ALLIED_HEALTH_PROMPTS } from "@/db/seed/verticals/au-allied-health";
import { AU_SAAS_PROMPTS } from "@/db/seed/verticals/au-saas";
import { AU_TRADIES_PROMPTS } from "@/db/seed/verticals/au-tradies";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { CATEGORY_TEMPLATES } from "@/lib/prompts/templates";
import {
  readSourcesBeforeAll,
  SOURCE_SCAN_TIMEOUT_MS,
  sourcePaths,
  sourceText,
} from "../../helpers/source-files";

const ROOTS = ["app", "components", "lib", "inngest", "db/seed/verticals"];
const CODE = /\.(ts|tsx)$/;
readSourcesBeforeAll(ROOTS, CODE);

/** Files whose strings aren't copy, each with why. */
const NOT_COPY: Record<string, string> = {
  "lib/brands/classify-brand.ts":
    "the classifier's instructions to the model, never shown to anyone; rewording them changes its input",
};

const DOUBLE_HYPHEN = / -- /;

function isConsoleCall(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "console"
  );
}

/** Each string, template part or JSX text containing " -- ", outside comments, console.* and tagged templates. */
function doubleHyphens(path: string, text: string): string[] {
  const sf = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];
  const visit = (node: ts.Node, inLog: boolean): void => {
    if (ts.isTaggedTemplateExpression(node)) return;
    const log = inLog || isConsoleCall(node);
    const s =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
        ? node.text
        : null;
    if (s !== null && !log && DOUBLE_HYPHEN.test(s)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      found.push(`${path}:${line + 1}  ${s.replace(/\s+/g, " ").trim().slice(0, 100)}`);
    }
    ts.forEachChild(node, (child) => visit(child, log));
  };
  visit(sf, false);
  return found;
}

describe("no ' -- ' in what the product shows or asks", () => {
  it("every question template, in every category", () => {
    const templates = Object.values(CATEGORY_TEMPLATES).flatMap((byBuyer) =>
      Object.values(byBuyer).flat(),
    );
    expect(templates.length).toBeGreaterThan(100);
    expect(templates.filter((t) => t.includes("--"))).toEqual([]);
    expect(templates).toContain("Plumber in {region} — who do locals trust for general repairs?");
  });

  it("every vertical pack prompt", () => {
    const prompts = [...AU_TRADIES_PROMPTS, ...AU_ALLIED_HEALTH_PROMPTS, ...AU_SAAS_PROMPTS];
    expect(prompts.length).toBeGreaterThan(300);
    expect(prompts.filter((p) => p.promptTemplate.includes("--"))).toEqual([]);
  });

  it(
    "shipped strings, templates and JSX text (comments, logs and SQL aside)",
    () => {
      const files = sourcePaths(ROOTS, CODE).filter((path) => !NOT_COPY[path]);
      expect(files.length).toBeGreaterThan(500);
      expect(files.flatMap((path) => doubleHyphens(path, sourceText(path)))).toEqual([]);
    },
    SOURCE_SCAN_TIMEOUT_MS,
  );

  it("the scan finds the shipped question in a string, a template and JSX, and skips comments, logs and SQL", () => {
    const shipped = "Plumber in {region} -- who do locals trust for general repairs?";
    const code = [
      `const a = "${shipped}";`,
      // A template literal with a substitution: its text parts are scanned.
      ["const b = `Hi $", "{name} -- there`;"].join(""),
      "const c = <p>Not enough data -- no answers</p>;",
      "// a comment -- not copy",
      "/* nor -- this */",
      "console.warn(`[pack] 2 short -- refilling`);",
      "await sql`SELECT 1 -- a SQL comment`;",
    ].join("\n");
    expect(doubleHyphens("x.tsx", code).map((f) => f.split("  ")[0])).toEqual([
      "x.tsx:1",
      "x.tsx:2",
      "x.tsx:3",
    ]);
  });

  it("the files left out still need it (the list can't rot)", () => {
    for (const [path, why] of Object.entries(NOT_COPY)) {
      expect(doubleHyphens(path, sourceText(path)).length, path).toBeGreaterThan(0);
      expect(why.length).toBeGreaterThan(20);
    }
  });

  it("stored packs regenerate: the generator's version moved past 2", () => {
    // 3 removed " -- " (13 Nov, part 4); later generators keep that.
    expect(PROMPT_GENERATOR_VERSION).toBeGreaterThanOrEqual(3);
  });
});
