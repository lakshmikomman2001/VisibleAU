/**
 * Rebrand (15 Nov), part 1 -- the mark, the wordmark and the logo in a page, drawn from lib/brand.ts (the one place
 * the brand comes from). The sidebar, the phone top bar, sign-in, sign-up, the password and invite card, the
 * public site's header, 404 and the error pages render BrandLogo.
 */
import type { CSSProperties } from "react";
import { BRAND_COLORS, BRAND_MARK, PRODUCT_NAME } from "@/lib/brand";

/**
 * The mark in a page, coloured by the theme's --brand-mark tokens (the same blue and white in both themes; the
 * fallbacks are for a page drawn without app/globals.css). Decorative beside the wordmark; give it a `title`
 * where it stands alone.
 */
export function BrandMark({ size = 22, title }: { size?: number; title?: string }) {
  const box = BRAND_MARK.viewBox;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      data-brand-mark=""
      style={{ flexShrink: 0, display: "block" }}
    >
      <rect
        width={box}
        height={box}
        rx={BRAND_MARK.radius}
        fill={`var(--brand-mark, ${BRAND_COLORS.mark})`}
      />
      <path d={BRAND_MARK.glyphPath} fill={`var(--brand-mark-fg, ${BRAND_COLORS.markFg})`} />
    </svg>
  );
}

const LOGO_SIZES = {
  md: { mark: 22, font: 15, gap: 9 },
  lg: { mark: 28, font: 17, gap: 10 },
} as const;

/** The wordmark: the product's name, in the theme's primary text colour. */
export function BrandWordmark({
  fontSize = LOGO_SIZES.md.font,
  style,
}: {
  fontSize?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      data-brand-wordmark=""
      style={{
        fontWeight: 700,
        fontSize,
        letterSpacing: "-0.01em",
        lineHeight: 1,
        color: "var(--text-primary)",
        ...style,
      }}
    >
      {PRODUCT_NAME}
    </span>
  );
}

/** The mark and the wordmark together: the logo at the top of the sidebar and of every page outside the app. */
export function BrandLogo({ size = "md" }: { size?: keyof typeof LOGO_SIZES }) {
  const s = LOGO_SIZES[size];
  return (
    <span data-brand-logo="" style={{ display: "inline-flex", alignItems: "center", gap: s.gap }}>
      <BrandMark size={s.mark} />
      <BrandWordmark fontSize={s.font} />
    </span>
  );
}
