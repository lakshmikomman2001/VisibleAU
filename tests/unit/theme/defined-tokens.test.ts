/**
 * Playwright-run follow-ups (10 Nov), part 8 -- `bg-primary`, `text-primary-foreground`, `text-muted-foreground`,
 * `bg-muted`, `bg-card` and `text-destructive` were used in 30-odd files, and app/globals.css's @theme defined
 * none of them, so Tailwind wrote no CSS: /brands/new's "Create brand" submit was plain text, and so were the
 * cookie banner's Accept and the error pages' buttons. And `background`/`foreground` followed the OS colour
 * scheme while the rest of the app follows data-theme, so on a light-mode OS the dark app's cookie banner was
 * white with white text.
 *
 * Now @theme maps every one of them onto the design tokens, in both themes, and this scan fails on a colour
 * utility whose colour isn't defined (Tailwind's own palette, or @theme's --color-*).
 */
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

readSourcesBeforeAll(["app", "components", "app/globals.css"], /\.(tsx|ts|css)$/);

const CSS_PATH = "app/globals.css";

const PALETTE = new Set(
  "slate gray zinc neutral stone red orange amber yellow lime green emerald teal cyan sky blue indigo violet purple fuchsia pink rose".split(
    " ",
  ),
);
const KEYWORDS = new Set(["black", "white", "transparent", "current", "inherit"]);
const COLOUR_UTILITY =
  /(?<![\w-])(?:[a-z0-9-]+:)*(bg|text|border(?:-[trblxy])?|ring|outline|fill|stroke|divide|placeholder|from|via|to|decoration|caret|accent)-([a-z][a-z-]*?)(?:-\d{2,3})?(?:\/\d+)?(?![\w-])/g;
// What follows those prefixes when it isn't a colour.
const NOT_A_COLOUR =
  /^(xs|sm|base|lg|xl|\dxl|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|none|solid|dashed|dotted|double|hidden|collapse|separate|x|y|t|b|l|r|s|e|inset|offset|opacity|gradient-to-[a-z]+|fixed|local|scroll|auto|cover|contain|repeat|no-repeat|top|bottom|current|inherit|blend|origin|clip-[a-z]+|indent|ellipsis|transparent)$/;

function themeColours(css: string): Map<string, string> {
  const block = css.match(/@theme inline \{([\s\S]*?)\n\}/)?.[1] ?? "";
  return new Map(
    [...block.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

/** The colour names class strings use that are neither Tailwind's nor @theme's, with where. */
function undefinedColours(): Map<string, Set<string>> {
  const defined = themeColours(sourceText(CSS_PATH));
  const missing = new Map<string, Set<string>>();
  for (const path of sourcePaths(["app", "components"], /\.tsx?$/)) {
    for (const line of sourceText(path).split("\n")) {
      if (!/className|clsx\(|cn\(/.test(line)) continue;
      for (const m of line.matchAll(COLOUR_UTILITY)) {
        const name = m[2];
        if (NOT_A_COLOUR.test(name) || PALETTE.has(name) || KEYWORDS.has(name)) continue;
        if (defined.has(name)) continue;
        if (!missing.has(name)) missing.set(name, new Set());
        missing.get(name)?.add(path);
      }
    }
  }
  return missing;
}

describe("every colour a class names is defined", () => {
  it("no colour utility names a colour that neither Tailwind nor app/globals.css's @theme defines", () => {
    expect(Object.fromEntries([...undefinedColours()].map(([k, v]) => [k, [...v]]))).toEqual({});
  });

  it("the app's own names map onto the design tokens, which follow data-theme (light and dark)", () => {
    const defined = themeColours(sourceText(CSS_PATH));
    expect(Object.fromEntries(defined)).toMatchObject({
      background: "var(--bg-base)",
      foreground: "var(--text-primary)",
      card: "var(--bg-elevated)",
      muted: "var(--bg-subtle)",
      "muted-foreground": "var(--text-secondary)",
      primary: "var(--accent-primary)",
      "primary-foreground": "var(--accent-primary-fg)",
      destructive: "var(--danger)",
    });
  });

  it("--background and --foreground are the tokens too, never the OS colour scheme's", () => {
    const css = sourceText(CSS_PATH);
    const root = css.match(/^:root \{([\s\S]*?)\n\}/m)?.[1] ?? "";
    expect(root).toMatch(/--background:\s*var\(--bg-base\);/);
    expect(root).toMatch(/--foreground:\s*var\(--text-primary\);/);
    for (const m of css.matchAll(
      /@media \(prefers-color-scheme: (?:dark|light)\) \{([\s\S]*?)\n\}/g,
    )) {
      expect(m[1]).not.toMatch(/--(?:background|foreground):/);
    }
  });

  it("the global error page, which replaces the root layout, brings the styles and the theme", () => {
    const page = sourceText("app/global-error.tsx");
    expect(page).toContain('import "./globals.css";');
    expect(page).toMatch(/<html [^>]*data-theme="dark"/);
  });
});

/** A theme's hex tokens, from its [data-theme="..."] block. */
function themeTokens(css: string, theme: "dark" | "light"): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(
    new RegExp(`\\[data-theme="${theme}"\\] \\{([\\s\\S]*?)\\n\\}`, "g"),
  )) {
    for (const t of m[1].matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g))
      out.set(t[1], t[2]);
  }
  return out;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("AA contrast (4.5:1) for the pairs those names make, in both themes", () => {
  const PAIRS: Array<[text: string, on: string, what: string]> = [
    ["--accent-primary-fg", "--accent-primary", "text-primary-foreground on bg-primary (buttons)"],
    ["--text-primary", "--bg-base", "text-foreground on bg-background"],
    ["--text-secondary", "--bg-base", "text-muted-foreground on bg-background"],
    ["--text-secondary", "--bg-elevated", "text-muted-foreground on bg-card"],
    ["--text-primary", "--bg-subtle", "text-foreground on bg-muted"],
    ["--danger", "--bg-base", "text-destructive on bg-background"],
    ["--accent-primary", "--bg-base", "text-primary on bg-background"],
  ];
  for (const theme of ["dark", "light"] as const) {
    it.each(PAIRS)(`${theme}: %s on %s (%s)`, (text, on) => {
      const tokens = themeTokens(sourceText(CSS_PATH), theme);
      const fg = tokens.get(text);
      const bg = tokens.get(on);
      expect(fg, `${theme} ${text}`).toBeDefined();
      expect(bg, `${theme} ${on}`).toBeDefined();
      expect(contrast(fg as string, bg as string)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 3 -- inline CSS variables too. Style props and CSS used
 * var(--muted) (132 times), var(--destructive), var(--layer-comm), var(--bg-surface) and others that nothing
 * defines, so the colour was dropped (a "Generate report" button had white text on no background). Every
 * var(--name) in app/, components/ and lib/ -- .ts, .tsx and .css, a templated "--name" inside var(...)
 * included -- is defined in app/globals.css, or is one of the few set elsewhere, listed with where.
 */
const SET_ELSEWHERE: Record<string, string> = {
  "--cookie-banner-height":
    "set on <html> by components/domain/shared/cookie-consent-banner.tsx while it's shown (0px fallback)",
};
const USES_ROOTS = ["app", "components", "lib"];
readSourcesBeforeAll(USES_ROOTS, /\.(tsx|ts|css)$/);

function definedInCss(css: string): Set<string> {
  return new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
}

/** Every custom property the code reads, with the files: var(--name), and "--name" inside a var(`...`). */
function usedVariables(): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();
  const add = (name: string, path: string) => {
    if (!used.has(name)) used.set(name, new Set());
    used.get(name)?.add(path);
  };
  for (const path of sourcePaths(USES_ROOTS, /\.(tsx|ts|css)$/)) {
    const text = sourceText(path).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const line of text.split("\n")) {
      if (/^\s*\/\//.test(line)) continue;
      for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
        // var(--layer-${layer}): the layer badge's keys, checked below.
        if (line.slice(m.index + m[0].length).startsWith("${")) continue;
        add(m[1], path);
      }
      if (line.includes("var(${"))
        for (const m of line.matchAll(/["'`](--[a-zA-Z0-9-]+)["'`]/g)) add(m[1], path);
    }
  }
  return used;
}

describe("every inline CSS variable is defined", () => {
  it("each var(--name) the code reads is defined in app/globals.css (or set where SET_ELSEWHERE says)", () => {
    const defined = definedInCss(sourceText(CSS_PATH));
    const missing = [...usedVariables()]
      .filter(([name]) => !defined.has(name) && !SET_ELSEWHERE[name] && !name.startsWith("--tw-"))
      .map(([name, paths]) => `${name}: ${[...paths].join(", ")}`);
    expect(missing).toEqual([]);
  });

  it("the scan reads something, and catches a templated name", () => {
    const used = usedVariables();
    expect(used.size).toBeGreaterThan(40);
    expect(
      used.get("--danger")?.has("components/domain/trust/linkedin-presence-scorecard.tsx"),
    ).toBe(true);
  });

  it("what's set elsewhere is still set there (the list can't rot)", () => {
    expect(sourceText("components/domain/shared/cookie-consent-banner.tsx")).toContain(
      '"--cookie-banner-height"',
    );
  });

  it("the layer badge's var(--layer-<key>) is defined for every key, in both themes", () => {
    const badge = sourceText("components/phase2/layer-badge.tsx");
    const keys = [
      ...(badge.match(/LAYER_KEYS = \[([\s\S]*?)\]/)?.[1] ?? "").matchAll(/"([a-z]+)"/g),
    ].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(5);
    for (const theme of ["dark", "light"] as const) {
      const tokens = themeTokens(sourceText(CSS_PATH), theme);
      for (const key of keys)
        expect(tokens.get(`--layer-${key}`), `${theme} --layer-${key}`).toBeDefined();
    }
  });
});

describe("AA contrast (4.5:1) for the tokens part 3 defined, in both themes", () => {
  const GROUNDS = ["--bg-base", "--bg-subtle", "--bg-elevated"];
  const TEXT_TOKENS = [
    "--layer-communication",
    "--layer-governance",
    "--step-audit",
    "--step-gap",
    "--step-explain",
    "--step-draft",
    "--step-measure",
  ];
  for (const theme of ["dark", "light"] as const) {
    it.each(TEXT_TOKENS)(`${theme}: %s as text on every bg- token`, (token) => {
      const tokens = themeTokens(sourceText(CSS_PATH), theme);
      const fg = tokens.get(token);
      expect(fg, `${theme} ${token}`).toBeDefined();
      for (const ground of GROUNDS)
        expect(
          contrast(fg as string, tokens.get(ground) as string),
          `${token} on ${ground}`,
        ).toBeGreaterThanOrEqual(4.5);
    });

    it(`${theme}: --layer-communication-fg on a --layer-communication button`, () => {
      const tokens = themeTokens(sourceText(CSS_PATH), theme);
      expect(
        contrast(
          tokens.get("--layer-communication-fg") as string,
          tokens.get("--layer-communication") as string,
        ),
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});
