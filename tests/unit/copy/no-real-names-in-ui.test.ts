import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

/**
 * 2 Nov (Sri's decision) -- the sign-up form showed "Sri Komman" and "Splice
 * Marketing" to every visitor. Examples in the product use neutral text, never
 * a real workspace, brand, person, business number or mail domain. This scans
 * the code that ships, every time the suite runs. Tests and fixtures may name
 * whatever they like.
 *
 * Comments are stripped first, the same way as no-double-hyphen-dash.test.ts:
 * they're never shown, and many record production evidence by name.
 */
const SHIPPED_DIRS = ["app", "components", "lib"];

const NOT_AN_EXAMPLE: Array<[RegExp, string]> = [
  [/splice/i, "a real workspace"],
  [/omega[ -]?services/i, "a real customer's brand"],
  [/komman/i, "a real person"],
  [/srininbox|sri@vunnara/i, "a real person's email"],
  [/58 ?110 ?395 ?714/, "an ABN that passes the ABN checksum, so probably a real business's"],
  [/bondi ?plumbing/i, "bondiplumbing.com.au is a live site"],
  [/eastern plumbing/i, "names a plausibly real business"],
  [/mybusiness\.com/i, "mybusiness.com.au is a live site"],
  [/@agency\.com\.au/i, "agency.com.au has live mail servers"],
];

// One walk per file, cached (tests/helpers/source-files.ts); each test reads the cache.
readSourcesBeforeAll(SHIPPED_DIRS);
const shippedFiles = () => sourcePaths(SHIPPED_DIRS);

function stripComments(source: string): string {
  const noBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlockComments.replace(/(^|\s)\/\/.*$/gm, "$1");
}

function read(file: string): string {
  return sourceText(file);
}

describe("examples in the product", () => {
  it("never use a real workspace, brand, person, business number or mail domain", () => {
    const found: string[] = [];
    for (const file of shippedFiles()) {
      const code = stripComments(sourceText(file));
      for (const [pattern, why] of NOT_AN_EXAMPLE) {
        const match = pattern.exec(code);
        if (match) {
          const name = file;
          found.push(`${name}: "${match[0]}" (${why})`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("the sign-up form's placeholders are neutral", () => {
    const signUp = read("app/sign-up/[[...sign-up]]/sign-up-form.tsx");
    expect(signUp).toContain('placeholder="Your full name"');
    expect(signUp).toContain('placeholder="Your agency or business name"');
    expect(signUp).toContain('placeholder="you@example.com"');
  });

  it("the sign-in form's and the brand forms' placeholders are neutral", () => {
    expect(read("app/sign-in/[[...sign-in]]/sign-in-form.tsx")).toContain(
      'placeholder="you@example.com"',
    );
    const wizard = read("app/(auth)/brands/wizard/wizard-form.tsx");
    expect(wizard).toContain('placeholder="Your business name"');
    expect(wizard).toContain('placeholder="example.com.au"');
    expect(wizard).toContain(`placeholder="A competitor's name"`);
    const oldForm = read("app/(auth)/brands/new/page.tsx");
    expect(oldForm).toContain('placeholder="Your business name"');
    expect(oldForm).toContain('placeholder="example.com.au"');
    expect(oldForm).toContain('placeholder="00 000 000 000"');
    expect(oldForm).toContain('title="11-digit ABN"');
  });
});

describe("the path to Report branding", () => {
  it("is 'Account → Report branding' wherever the product says it: the sidebar's group is Account", () => {
    const stale: string[] = [];
    for (const file of shippedFiles()) {
      if (/Settings\s*(→|->|&rarr;)\s*Report branding/.test(stripComments(sourceText(file)))) {
        stale.push(file);
      }
    }
    expect(stale).toEqual([]);
    // The list may carry its type (e0f8aba): `ACCOUNT_ITEMS: {...}[] = [`.
    expect(read("components/domain/app-sidebar.tsx")).toMatch(
      /ACCOUNT_ITEMS\b[^=]*= \[[\s\S]*?label: "Report branding"[\s\S]*?\];/,
    );
    // The breadcrumb names the group as the sidebar does.
    expect(read("lib/navigation/breadcrumbs.ts")).toMatch(
      /settings: \{ label: "Account", href: "\/settings" \}/,
    );
  });
});
