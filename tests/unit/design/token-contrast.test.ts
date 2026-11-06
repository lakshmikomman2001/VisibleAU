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
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve(__dirname, "../../../app/globals.css"), "utf-8");

const TEXT_TOKENS = ["--text-primary", "--text-secondary", "--text-tertiary"] as const;
const SURFACE_TOKENS = ["--bg-base", "--bg-subtle", "--bg-elevated", "--bg-hover"] as const;

/** Every `--name: #hex` declared in the theme's [data-theme="…"] blocks. */
function themeTokens(theme: "dark" | "light"): Map<string, string> {
  const tokens = new Map<string, string>();
  const block = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`, "g");
  for (const [, body] of CSS.matchAll(block)) {
    for (const [, name, hex] of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
      tokens.set(name, hex.toLowerCase());
    }
  }
  return tokens;
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
  for (const theme of ["dark", "light"] as const) {
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
