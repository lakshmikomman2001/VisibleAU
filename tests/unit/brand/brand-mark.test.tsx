/**
 * Rebrand (15 Nov), part 1 -- the mark (lib/brand.ts): the report PDF's blue rounded square with a white "V",
 * drawn from one module everywhere, coloured by theme tokens that are AA in both themes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SimpleAuthCard } from "@/components/domain/auth/simple-auth-card";
import { BrandLogo, BrandMark } from "@/components/shared/brand-logo";
import { BRAND_COLORS, BRAND_MARK, PRODUCT_NAME } from "@/lib/brand";
import { C } from "@/lib/reports/pdf/tokens";

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");

type Theme = "dark" | "light";
const THEMES: readonly Theme[] = ["dark", "light"];

/** The theme's `--name: #hex` tokens, from its [data-theme] blocks in app/globals.css. */
function tokens(theme: Theme): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, body] of CSS.matchAll(
    new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`, "g"),
  ))
    for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g))
      out.set(name, value.toLowerCase());
  return out;
}

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

describe("the mark's colours, in both themes", () => {
  for (const theme of THEMES) {
    it(`${theme}: --brand-mark and --brand-mark-fg are lib/brand.ts's colours`, () => {
      const t = tokens(theme);
      expect(t.get("--brand-mark")).toBe(BRAND_COLORS.mark.toLowerCase());
      expect(t.get("--brand-mark-fg")).toBe(BRAND_COLORS.markFg.toLowerCase());
    });

    it(`${theme}: the V is AA on the square (4.5:1), and the square is at least 3:1 on every page surface`, () => {
      const t = tokens(theme);
      const mark = t.get("--brand-mark") as string;
      expect(contrast(t.get("--brand-mark-fg") as string, mark)).toBeGreaterThanOrEqual(4.5);
      for (const surface of ["--bg-base", "--bg-subtle", "--bg-elevated"]) {
        const ground = t.get(surface);
        expect(ground, `${theme} ${surface}`).toMatch(/^#[0-9a-f]{6}$/);
        expect(contrast(mark, ground as string), `${theme} ${surface}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it("the wordmark is --text-primary, AA on every surface in both themes (tests/unit/design/token-contrast.test.ts)", () => {
    const html = renderToStaticMarkup(<BrandLogo />);
    expect(html).toContain("color:var(--text-primary)");
  });

  it("is the PDF's own blue: the report's tokens read it from the brand module", () => {
    expect(C.brand).toBe(BRAND_COLORS.mark);
    expect(C.white).toBe(BRAND_COLORS.markFg);
  });
});

describe("the mark in a page", () => {
  it("is an SVG square and the V, filled by the theme tokens (with the brand colours as fallbacks)", () => {
    const html = renderToStaticMarkup(<BrandMark size={22} />);
    expect(html).toMatch(/^<svg[^>]*width="22"[^>]*height="22"/);
    expect(html).toContain(`rx="${BRAND_MARK.radius}"`);
    expect(html).toContain(`fill="var(--brand-mark, ${BRAND_COLORS.mark})"`);
    expect(html).toContain(`d="${BRAND_MARK.glyphPath}"`);
    expect(html).toContain(`fill="var(--brand-mark-fg, ${BRAND_COLORS.markFg})"`);
    // Beside the wordmark it's decorative; alone, it's an image named for the product.
    expect(html).toContain('aria-hidden="true"');
    const alone = renderToStaticMarkup(<BrandMark title={PRODUCT_NAME} />);
    expect(alone).toContain('role="img"');
    expect(alone).toContain(`aria-label="${PRODUCT_NAME}"`);
  });

  it("the logo is the mark and the name, and nothing of the old wordmark", () => {
    const html = renderToStaticMarkup(<BrandLogo size="lg" />);
    expect(html).toContain("data-brand-mark");
    expect(html).toContain(`>${PRODUCT_NAME}</span>`);
    expect(html).not.toMatch(/>\s*visible\s*</i);
    expect(html).not.toMatch(/>\s*au\s*</i);
  });

  it("the password and invite pages' card shows it", () => {
    const html = renderToStaticMarkup(
      <SimpleAuthCard title="Reset your password">x</SimpleAuthCard>,
    );
    expect(html).toContain("data-brand-logo");
    expect(html).toContain(`>${PRODUCT_NAME}</span>`);
  });

  it("every logo in the app shell and outside the app is the brand module's", () => {
    const surfaces = [
      "components/domain/app-sidebar.tsx",
      "components/domain/app-topbar.tsx",
      "components/domain/auth/simple-auth-card.tsx",
      "app/sign-in/[[...sign-in]]/sign-in-form.tsx",
      "app/sign-up/[[...sign-up]]/sign-up-form.tsx",
      "app/(marketing)/layout.tsx",
      "app/not-found.tsx",
      "app/error.tsx",
      "app/global-error.tsx",
    ];
    for (const file of surfaces) {
      const code = readFileSync(join(process.cwd(), file), "utf-8");
      expect(code, file).toMatch(/import \{ BrandLogo \} from "@\/components\/shared\/brand-logo"/);
      expect(code, file).toMatch(/<BrandLogo\b/);
    }
  });
});
