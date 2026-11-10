/**
 * 6 Nov (phone-layout follow-ups, item 3) -- axe found color-contrast
 * violations in the sidebar and the phone drawer, in both themes: the
 * section labels, the plan and tier lines and the logo's "au" are
 * --text-tertiary, which was 4.04:1 on the sidebar (--bg-subtle) and 3.67:1
 * on its cards (--bg-elevated) in dark, and 4.40:1 on the sidebar in light.
 *
 * The rule now, read from app/globals.css itself: in each theme, every text
 * token is at least 4.5:1 (WCAG AA for normal text, and so above the 3:1
 * that large text and UI icons need) on every surface token. Text sits on
 * those surfaces across the app, so this also holds the other pages at AA.
 * --text-disabled is left out: WCAG exempts disabled controls.
 *
 * Before the next push (11 Nov), part 2 -- every colour token, not just the three text- ones. In light,
 * workflow (3.05:1), retrieval (3.59:1) and trust (about 3.2:1) were under AA as text, and so were success,
 * warning, info and danger; in dark, content and intelligence on a card. Now, in both themes:
 *   - every colour token (all but the bg-, border-, -soft and -fg ones, --accent-muted and --text-disabled) is
 *     at least 4.5:1 on --bg-base, --bg-subtle and --bg-elevated, and on its own -soft tint;
 *   - every -fg token is at least 4.5:1 on the colour it's named for (text on a button of that colour);
 *   - every token the code uses as a text colour is one of those;
 *   - every fill and text colour a style object sets together is at least 4.5:1, a tint (an rgba -soft
 *     token or a color-mix(... N%, transparent)) taken over --bg-base and over --bg-elevated; and white or
 *     black text on a colour token is that token's -fg instead.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourceFiles } from "../../helpers/source-files";

const CSS = readFileSync(resolve(__dirname, "../../../app/globals.css"), "utf-8");

const TEXT_TOKENS = ["--text-primary", "--text-secondary", "--text-tertiary"] as const;
const SURFACE_TOKENS = ["--bg-base", "--bg-subtle", "--bg-elevated", "--bg-hover"] as const;

type Theme = "dark" | "light";
const THEMES: readonly Theme[] = ["dark", "light"];

/** Every `--name: #hex` declared in the theme's [data-theme="…"] blocks. */
function themeTokens(theme: Theme): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [name, value] of themeValues(theme))
    if (value.startsWith("#")) tokens.set(name, value);
  return tokens;
}

/** Every `--name: #hex` or `--name: rgba(...)` in the theme's blocks, and the aliases outside them. */
function themeValues(theme: Theme): Map<string, string> {
  const values = new Map<string, string>();
  const block = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`, "g");
  for (const [, body] of CSS.matchAll(block)) {
    for (const [, name, value] of body.matchAll(
      /(--[\w-]+):\s*(#[0-9a-fA-F]{6}\b|rgba\([^)]*\))/g,
    )) {
      values.set(name, value.toLowerCase());
    }
  }
  // :root's --background: var(--bg-base) and --foreground: var(--text-primary).
  for (const [, alias, target] of CSS.matchAll(
    /(--(?:background|foreground)):\s*var\((--[\w-]+)\)/g,
  )) {
    const value = values.get(target);
    if (value) values.set(alias, value);
  }
  return values;
}

const rgbOf = (hex: string) =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** A tint (rgba, or a colour at `alpha`) laid over an opaque ground, as #rrggbb. */
function over(tint: string, ground: string, alpha?: number): string {
  const [r, g, b, a] = tint.startsWith("#")
    ? [...rgbOf(tint), alpha ?? 1]
    : (tint.match(/[\d.]+/g) ?? []).map(Number);
  const base = rgbOf(ground);
  return `#${[r, g, b]
    .map((c, i) =>
      Math.round(c * a + base[i] * (1 - a))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** WCAG 2 relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const s = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme tokens: text on every surface is WCAG AA", () => {
  for (const theme of THEMES) {
    it(`${theme}: every text token is at least 4.5:1 on every surface token`, () => {
      const tokens = themeTokens(theme);
      const below: string[] = [];
      for (const text of TEXT_TOKENS) {
        for (const surface of SURFACE_TOKENS) {
          const fg = tokens.get(text);
          const bg = tokens.get(surface);
          expect(fg, `${theme} ${text}`).toMatch(/^#[0-9a-f]{6}$/);
          expect(bg, `${theme} ${surface}`).toMatch(/^#[0-9a-f]{6}$/);
          const ratio = contrast(fg as string, bg as string);
          if (ratio < 4.5) below.push(`${text} ${fg} on ${surface} ${bg}: ${ratio.toFixed(2)}:1`);
        }
      }
      expect(below).toEqual([]);
    });
  }

  it("the contrast maths matches WCAG's own figures", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
});

// ---- Before the next push (11 Nov), part 2 ----

/**
 * Not text colours: surfaces, borders, tints, button-text tokens (checked on their fill), disabled text, and
 * :root's two aliases (--background is --bg-base; --foreground is --text-primary, checked under that name).
 */
const NOT_TEXT =
  /^--bg-|^--border-|-soft$|-fg$|^--accent-muted$|^--text-disabled$|^--(background|foreground)$/;
const GROUNDS = ["--bg-base", "--bg-subtle", "--bg-elevated"] as const;

/** The colour tokens checked as text: every hex token of the theme but the NOT_TEXT ones. */
function textColourTokens(theme: Theme): Map<string, string> {
  return new Map([...themeTokens(theme)].filter(([name]) => !NOT_TEXT.test(name)));
}

readSourcesBeforeAll(["app", "components", "lib"]);
const code = () => sourceFiles(["app", "components", "lib"]);
const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** Tailwind's theme colours (@theme inline): text-<name> reads --color-<name>, which is var(--token). */
const THEME_COLOURS = new Map(
  [...CSS.matchAll(/--color-([\w-]+):\s*var\((--[\w-]+)\)/g)].map(([, name, token]) => [
    name,
    token,
  ]),
);

/** The tokens each file uses as a text colour, with where. A templated --layer-${...} means every layer. */
function textColourUses(): Array<{ token: string; at: string }> {
  const uses: Array<{ token: string; at: string }> = [];
  const layers = [...themeTokens("dark").keys()].filter((n) => /^--layer-[a-z]+$/.test(n));
  for (const { path, text } of code()) {
    for (const m of text.matchAll(/(?<![\w-])color:\s*["'`]?var\((--[\w-]+?)(\$\{|[,)])/g)) {
      const at = `${path}:${lineOf(text, m.index)}`;
      const templated = m[2] !== "," && m[2] !== ")";
      if (templated && m[1] === "--layer-") for (const token of layers) uses.push({ token, at });
      else if (!templated) uses.push({ token: m[1], at });
    }
    for (const m of text.matchAll(/(?<![\w-])text-\[(?:color:)?var\((--[\w-]+)\)\]/g))
      uses.push({ token: m[1], at: `${path}:${lineOf(text, m.index)}` });
    for (const m of text.matchAll(/(?<![\w-])text-([a-z]+(?:-[a-z]+)*)(?=[\s"'`/:])/g)) {
      const token = THEME_COLOURS.get(m[1]);
      if (token) uses.push({ token, at: `${path}:${lineOf(text, m.index)} (text-${m[1]})` });
    }
  }
  return uses;
}

const WHITE_OR_BLACK = /^(#fff|#ffffff|white|#000|#000000|black)$/i;

/** Each style object (`{{ ... }}`) that sets a token fill, or a color-mix tint of one, and a text colour. */
function fillAndTextPairs(): Array<{ fill: string; tintPct?: number; text: string; at: string }> {
  const pairs: Array<{ fill: string; tintPct?: number; text: string; at: string }> = [];
  for (const { path, text } of code()) {
    for (const m of text.matchAll(/\{\{([^{}]*)\}\}/g)) {
      const body = m[1];
      const fill = body.match(/background(?:Color)?:\s*["'`]var\((--[\w-]+)\)["'`]/);
      const mix = body.match(
        /background(?:Color)?:\s*["'`]color-mix\(in srgb, var\((--[\w-]+)\) (\d+)%, transparent\)["'`]/,
      );
      const colour = body.match(/(?<![\w-])color:\s*["'`](?:var\((--[\w-]+)[,)]|([^"'`$]+)["'`])/);
      if (!(fill || mix) || !colour) continue;
      pairs.push({
        fill: fill ? fill[1] : (mix as RegExpMatchArray)[1],
        tintPct: mix && !fill ? Number(mix[2]) : undefined,
        text: colour[1] ?? colour[2].trim(),
        at: `${path}:${lineOf(text, m.index)}`,
      });
    }
  }
  return pairs;
}

describe("every colour token used as text is WCAG AA, in both themes (before the next push, part 2)", () => {
  for (const theme of THEMES) {
    it(`${theme}: every colour token is at least 4.5:1 on --bg-base, --bg-subtle, --bg-elevated and its own -soft tint`, () => {
      const values = themeValues(theme);
      const below: string[] = [];
      for (const [token, hex] of textColourTokens(theme)) {
        const soft = values.get(`${token}-soft`);
        const grounds: Array<[string, string]> = GROUNDS.map((g) => [g, values.get(g) as string]);
        if (soft)
          for (const g of ["--bg-base", "--bg-elevated"])
            grounds.push([`${token}-soft over ${g}`, over(soft, values.get(g) as string)]);
        for (const [name, ground] of grounds) {
          const ratio = contrast(hex, ground);
          if (ratio < 4.5) below.push(`${token} ${hex} on ${name}: ${ratio.toFixed(2)}:1`);
        }
      }
      expect(below).toEqual([]);
    });

    it(`${theme}: every -fg token is at least 4.5:1 on the colour it's named for`, () => {
      const tokens = themeTokens(theme);
      const fgTokens = [...tokens.keys()].filter((n) => n.endsWith("-fg"));
      expect(fgTokens.length).toBeGreaterThanOrEqual(7);
      const below = fgTokens.flatMap((fg) => {
        const fill = tokens.get(fg.replace(/-fg$/, ""));
        if (!fill) return [`${fg}: no ${fg.replace(/-fg$/, "")} to sit on`];
        const ratio = contrast(tokens.get(fg) as string, fill);
        return ratio < 4.5 ? [`${fg} on ${fg.replace(/-fg$/, "")}: ${ratio.toFixed(2)}:1`] : [];
      });
      expect(below).toEqual([]);
    });

    it(`${theme}: every fill and text colour a style object sets together is at least 4.5:1`, () => {
      const values = themeValues(theme);
      const below: string[] = [];
      for (const { fill, tintPct, text, at } of fillAndTextPairs()) {
        const fillValue = values.get(fill);
        if (!fillValue) continue; // not a theme colour (e.g. --cookie-banner-height never fills)
        if (WHITE_OR_BLACK.test(text)) {
          if (!fill.startsWith("--bg-"))
            below.push(`${at}: ${text} on ${fill} -- use ${fill}-fg (defined for both themes)`);
          continue;
        }
        const textValue = values.get(text);
        if (!textValue?.startsWith("#")) continue; // a literal colour or a non-theme variable
        const tinted = tintPct !== undefined || !fillValue.startsWith("#");
        const grounds = tinted
          ? ["--bg-base", "--bg-elevated"].map((g) =>
              over(
                fillValue,
                values.get(g) as string,
                tintPct === undefined ? undefined : tintPct / 100,
              ),
            )
          : [fillValue];
        const ratio = Math.min(...grounds.map((g) => contrast(textValue, g)));
        if (ratio < 4.5)
          below.push(
            `${at}: ${text} on ${tintPct === undefined ? fill : `${tintPct}% ${fill}`}: ${ratio.toFixed(2)}:1`,
          );
      }
      expect(below).toEqual([]);
    });
  }

  it("every token the code uses as a text colour is one of the tokens checked above", () => {
    const checked = new Set([
      ...textColourTokens("dark").keys(),
      ...[...themeTokens("dark").keys()].filter((n) => n.endsWith("-fg")),
      "--text-disabled", // WCAG exempts disabled text
      "--foreground", // :root's alias of --text-primary
    ]);
    const uses = textColourUses();
    expect(uses.length).toBeGreaterThan(500);
    const unchecked = uses
      .filter(({ token }) => !checked.has(token))
      .map((u) => `${u.at}: ${u.token}`);
    expect(unchecked).toEqual([]);
  });

  it("the scans see the pairs and tints the code renders", () => {
    const pairs = fillAndTextPairs();
    expect(pairs.length).toBeGreaterThan(100);
    expect(pairs.some((p) => p.tintPct !== undefined)).toBe(true);
    expect(pairs.some((p) => p.fill === "--success-soft" && p.text === "--success")).toBe(true);
    // A tint over a white card, by hand: 10% of #000000 over #ffffff is #e6e6e6.
    expect(over("#000000", "#ffffff", 0.1)).toBe("#e6e6e6");
    expect(over("rgba(0,0,0,0.1)", "#ffffff")).toBe("#e6e6e6");
  });
});
