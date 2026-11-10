/**
 * Playwright-run follow-ups (10 Nov), part 7 -- the legal name. The Terms said Vunnara "is operated by" a
 * company and the footer's copyright named it; Sri, 10 Nov: there is no such company, the business is a sole
 * trader. The name and ABN are lib/product.ts's constants, rendered by the Terms, the privacy page and the
 * footer, and no page writes a company name of its own.
 *
 * They're placeholders until Sri supplies the exact name and ABN: the first test fails until then, on purpose
 * (tests/known-failures.txt says why), and a production build stops (next.config.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  assertLegalEntityForProduction,
  LEGAL_ABN,
  LEGAL_ENTITY_NAME,
  legalEntityIsSet,
  PRODUCT_NAME,
} from "@/lib/product";
import {
  NON_TEST_ROOTS,
  readSourcesBeforeAll,
  sourcePaths,
  sourceText,
} from "../../helpers/source-files";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element).replace(/&amp;/g, "&");

// Values shaped like real ones, for the checks themselves; never shown anywhere.
const SET_NAME = "Test Sole Trader";
const SET_ABN = "12 345 678 901";

// Code and text files alike: SQL, Markdown, JSON and public HTML can carry a name too.
const TEXT_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|json|sql|md|txt|html|xml|css)$/;
readSourcesBeforeAll([...NON_TEST_ROOTS, "public", "tests"], TEXT_FILE);
const filesUnder = (roots: readonly string[]) =>
  sourcePaths(roots, TEXT_FILE).map((path) => ({ path, text: sourceText(path) }));

/** Blank out a match but keep its line breaks, so line numbers stay right. */
const blank = (m: string) => m.replace(/[^\n]/g, "");

/** Code with its comments removed: JS/JSX block and line comments, and SQL "--" lines. */
const withoutComments = (path: string, text: string) =>
  path.endsWith(".sql")
    ? text.replace(/--.*$/gm, "")
    : text
        .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, blank)
        .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("the legal name and ABN", () => {
  it("are Sri's real values, not the placeholders (fails until Sri supplies them, before the push)", () => {
    expect(legalEntityIsSet(), `${LEGAL_ENTITY_NAME} / ${LEGAL_ABN}`).toBe(true);
  });

  it("count as set only when the name isn't a [placeholder] and the ABN has 11 digits", () => {
    expect(legalEntityIsSet(LEGAL_ENTITY_NAME, SET_ABN)).toBe(false);
    expect(legalEntityIsSet(SET_NAME, LEGAL_ABN)).toBe(false);
    expect(legalEntityIsSet(SET_NAME, "1234")).toBe(false);
    expect(legalEntityIsSet("", SET_ABN)).toBe(false);
    expect(legalEntityIsSet(SET_NAME, SET_ABN)).toBe(true);
    expect(legalEntityIsSet(SET_NAME, "12345678901")).toBe(true);
  });

  it("stop a production build while they're placeholders, and only a production one", () => {
    expect(() => assertLegalEntityForProduction({ VERCEL_ENV: "production" })).toThrow(
      /LEGAL_ENTITY_NAME and LEGAL_ABN/,
    );
    expect(() =>
      assertLegalEntityForProduction({ VERCEL_ENV: "production" }, SET_NAME, SET_ABN),
    ).not.toThrow();
    for (const env of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, {}]) {
      expect(() => assertLegalEntityForProduction(env)).not.toThrow();
    }
  });

  it("next.config.ts checks them when it loads", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toMatch(/^assertLegalEntityForProduction\(\);$/m);
  });

  it("are what the Terms, the privacy page and the footer show", async () => {
    const operatedBy = `${PRODUCT_NAME} is operated by ${LEGAL_ENTITY_NAME} (ABN ${LEGAL_ABN}), a sole trader`;
    const Terms = (await import("@/app/(marketing)/terms/page")).default;
    expect(html(<Terms />)).toContain(operatedBy);

    const Privacy = (await import("@/app/(marketing)/privacy/page")).default;
    expect(html(<Privacy />)).toContain(operatedBy);

    const { Footer } = await import("@/components/domain/landing/footer");
    const footer = html(<Footer />);
    expect(footer).toMatch(/© \d{4} /);
    expect(footer).toContain(`${LEGAL_ENTITY_NAME}. All rights reserved`);
  }, 60_000);

  it("the Terms and the privacy page name the product by its constant, not the old name", () => {
    for (const page of ["app/(marketing)/terms/page.tsx", "app/(marketing)/privacy/page.tsx"]) {
      const code = withoutComments(page, sourceText(page));
      expect(code, page).not.toMatch(/VisibleAU/);
      expect(code, page).toContain("{PRODUCT_NAME}");
    }
  });
});

describe("no company name of its own", () => {
  it("the old company name is nowhere in the code or the tests, comments included", () => {
    const OLD = new RegExp(["VisibleAU", "Pty", "Ltd"].join("\\s+"), "i");
    const offenders = filesUnder([...NON_TEST_ROOTS, "public", "tests"])
      .filter((f) => !f.path.includes("/_archive/") && OLD.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('no code that ships says "Pty Ltd" but lib/product.ts\'s LEGAL_ENTITY_NAME (comments aside)', () => {
    const PTY_LTD = /\bPty\.?\s*Ltd\b|Proprietary\s+Limited/i;
    const offenders = filesUnder([...NON_TEST_ROOTS, "public"]).flatMap((f) =>
      withoutComments(f.path, f.text)
        .split("\n")
        .map((line, i) => ({ line, at: `${f.path}:${i + 1}` }))
        .filter(({ line }) => PTY_LTD.test(line))
        .filter(
          ({ line, at }) =>
            !(at.startsWith("lib/product.ts:") && /^export const LEGAL_ENTITY_NAME = /.test(line)),
        )
        .map(({ at, line }) => `${at}  ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
