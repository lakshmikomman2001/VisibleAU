/**
 * Playwright-run follow-ups (10 Nov), part 7 -- the legal name. The Terms said Vunnara "is operated by" a
 * company and the footer's copyright named it; Sri, 10 Nov: there is no such company, the business is a sole
 * trader. The name and ABN are lib/product.ts's constants, rendered by the Terms, the privacy page and the
 * footer, and no page writes a company name of its own.
 *
 * Before the next push (11 Nov), part 1 -- Sri's values: "Vunnara", ABN 35 523 139 837. The footer reads
 * "Vunnara · ABN 35 523 139 837", the Terms' and the privacy page's "Who we are" "Vunnara (ABN 35 523 139 837)",
 * and none of the three renders a personal name: every capitalised word they show is the business's name or a
 * word on NOT_NAMES below. A production build still stops on a placeholder or a mistyped ABN (next.config.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  abnCheckDigitsValid,
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

// Values shaped like real ones, for the checks themselves; never shown anywhere. SET_ABN passes the ATO's check
// digits; MISTYPED_ABN is the same shape and doesn't.
const SET_NAME = "Test Sole Trader";
const SET_ABN = "12 345 670 031";
const MISTYPED_ABN = "12 345 678 901";
// What lib/product.ts held until 11 Nov.
const PLACEHOLDER_NAME = "[Legal name: set before launch]";
const PLACEHOLDER_ABN = "[ABN: set before launch]";

/** The text a page shows: tags dropped, the entities these pages use decoded. */
const visibleText = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

/**
 * Every capitalised word the footer, the Terms and the privacy page show that isn't a person's name: sentence
 * starts, headings, places, laws and the providers the privacy page lists. A word that isn't here fails the
 * check below; if it isn't a person, add it.
 */
const NOT_NAMES = new Set([
  // Headings, sentence starts and the footer's links.
  ...[
    "Terms",
    "Service",
    "Privacy",
    "Policy",
    "Last",
    "Who",
    "We",
    "By",
    "You",
    "Your",
    "When",
    "The",
  ],
  ...["To", "If", "Under", "Paid", "Billing", "Questions", "Complaints", "Methodology", "Contact"],
  // The Terms' "Prices are in Australian dollars. ..." (GST-free pricing, 11 Nov).
  "Prices",
  ...[
    "Acceptance",
    "Acceptable",
    "Limitation",
    "Results",
    "All",
    "Our",
    "Once",
    "How",
    "Two",
    "For",
  ],
  ...[
    "Third-party",
    "Action",
    "Actions",
    "Center",
    "Information",
    "Office",
    "Commissioner",
    "Principles",
  ],
  ...["Act", "Payment", "Sign-in", "PDF"],
  // Places, tax and the regulator.
  ...["Australia", "Australian", "United", "States", "ABN", "GST", "OAIC"],
  // Technology and the providers the pages name.
  ...[
    "AI",
    "API",
    "APIs",
    "LLM",
    "IP",
    "Stripe",
    "Anthropic",
    "Claude",
    "OpenAI",
    "ChatGPT",
    "Google",
  ],
  ...["Gemini", "Perplexity"],
  // "Last updated: <month> <year>".
  ...["January", "February", "March", "April", "May", "June", "July", "August", "September"],
  ...["October", "November", "December"],
]);

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
  it("are Sri's values (11 Nov): Vunnara, ABN 35 523 139 837", () => {
    expect(LEGAL_ENTITY_NAME).toBe("Vunnara");
    expect(LEGAL_ABN).toBe("35 523 139 837");
    expect(legalEntityIsSet(), `${LEGAL_ENTITY_NAME} / ${LEGAL_ABN}`).toBe(true);
    expect(abnCheckDigitsValid(LEGAL_ABN)).toBe(true);
  });

  it("count as set only when the name isn't a [placeholder] and the ABN has 11 digits that pass the check", () => {
    expect(legalEntityIsSet(PLACEHOLDER_NAME, SET_ABN)).toBe(false);
    expect(legalEntityIsSet(SET_NAME, PLACEHOLDER_ABN)).toBe(false);
    expect(legalEntityIsSet(SET_NAME, "1234")).toBe(false);
    expect(legalEntityIsSet("", SET_ABN)).toBe(false);
    expect(legalEntityIsSet(SET_NAME, MISTYPED_ABN)).toBe(false);
    expect(legalEntityIsSet(SET_NAME, SET_ABN)).toBe(true);
    expect(legalEntityIsSet(SET_NAME, SET_ABN.replace(/ /g, ""))).toBe(true);
  });

  it("stop a production build on a placeholder or a mistyped ABN, and only a production one", () => {
    const production = { VERCEL_ENV: "production" };
    for (const [name, abn] of [
      [PLACEHOLDER_NAME, PLACEHOLDER_ABN],
      [PLACEHOLDER_NAME, LEGAL_ABN],
      [LEGAL_ENTITY_NAME, MISTYPED_ABN],
    ]) {
      expect(
        () => assertLegalEntityForProduction(production, name, abn),
        `${name} / ${abn}`,
      ).toThrow(/LEGAL_ENTITY_NAME and LEGAL_ABN/);
    }
    expect(() => assertLegalEntityForProduction(production)).not.toThrow();
    for (const env of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, {}]) {
      expect(() =>
        assertLegalEntityForProduction(env, PLACEHOLDER_NAME, PLACEHOLDER_ABN),
      ).not.toThrow();
    }
  });

  it("next.config.ts checks them when it loads", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toMatch(/^assertLegalEntityForProduction\(\);$/m);
  });

  it("are what the Terms, the privacy page and the footer show", async () => {
    const whoWeAre = `We are ${LEGAL_ENTITY_NAME} (ABN ${LEGAL_ABN}), a sole trader in Australia.`;
    const Terms = (await import("@/app/(marketing)/terms/page")).default;
    expect(visibleText(<Terms />)).toContain(`Who we are ${whoWeAre}`);

    const Privacy = (await import("@/app/(marketing)/privacy/page")).default;
    expect(visibleText(<Privacy />)).toContain(`Who we are ${whoWeAre}`);

    const { Footer } = await import("@/components/domain/landing/footer");
    expect(visibleText(<Footer />)).toMatch(
      new RegExp(`© \\d{4} ${LEGAL_ENTITY_NAME} · ABN ${LEGAL_ABN} `),
    );
    expect(visibleText(<Footer />)).toContain("Vunnara · ABN 35 523 139 837");
  }, 60_000);

  it("the Terms and the privacy page name the business by its constant, not the old name", () => {
    for (const page of ["app/(marketing)/terms/page.tsx", "app/(marketing)/privacy/page.tsx"]) {
      const code = withoutComments(page, sourceText(page));
      expect(code, page).not.toMatch(/VisibleAU/);
      expect(code, page).toContain("{LEGAL_ENTITY_NAME}");
    }
    // The Terms name the product too ("By using Vunnara, you agree ...").
    expect(sourceText("app/(marketing)/terms/page.tsx")).toContain("By using {PRODUCT_NAME}");
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

describe("no personal name (Sri, 11 Nov)", () => {
  const PAGES = [
    { file: "components/domain/landing/footer.tsx", says: "{LEGAL_ENTITY_NAME} · ABN {LEGAL_ABN}" },
    { file: "app/(marketing)/terms/page.tsx", says: "{LEGAL_ENTITY_NAME} (ABN {LEGAL_ABN})" },
    { file: "app/(marketing)/privacy/page.tsx", says: "{LEGAL_ENTITY_NAME} (ABN {LEGAL_ABN})" },
  ];

  it("the footer, the Terms and the privacy page render no name but LEGAL_ENTITY_NAME", async () => {
    const { Footer } = await import("@/components/domain/landing/footer");
    const Terms = (await import("@/app/(marketing)/terms/page")).default;
    const Privacy = (await import("@/app/(marketing)/privacy/page")).default;
    const rendered = [
      { page: "footer", text: visibleText(<Footer />) },
      { page: "terms", text: visibleText(<Terms />) },
      { page: "privacy", text: visibleText(<Privacy />) },
    ];
    const unknown = rendered.flatMap(({ page, text }) =>
      [...new Set(text.match(/\b[A-Z][A-Za-z-]*/g) ?? [])]
        .filter(
          (word) => word !== LEGAL_ENTITY_NAME && word !== PRODUCT_NAME && !NOT_NAMES.has(word),
        )
        .map((word) => `${page}: ${word}`),
    );
    expect(
      unknown,
      "a name? These pages name only LEGAL_ENTITY_NAME; if it isn't a person, add it to NOT_NAMES",
    ).toEqual([]);
  }, 60_000);

  it("their source names the business by the constants: no name or ABN of its own", () => {
    for (const { file, says } of PAGES) {
      const code = withoutComments(file, sourceText(file));
      expect(code, file).toContain(says);
      expect(code, file).not.toMatch(/\b\d{2} ?\d{3} ?\d{3} ?\d{3}\b/);
      expect(code, file).not.toMatch(new RegExp(LEGAL_ENTITY_NAME));
    }
  });
});
