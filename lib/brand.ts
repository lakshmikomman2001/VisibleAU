/**
 * Rebrand (15 Nov), part 1 -- the one place Vunnara's brand comes from: the name, the one-line description, the
 * mark (the report PDF's blue rounded square with a white "V"), the wordmark beside it, and the colours, sizes
 * and paths of every icon and share image made from it. The sidebar, the phone top bar, sign-in and sign-up,
 * the password and invite pages, 404 and the error pages, the public site's header, the emails, the PDF, the
 * favicon and app icons, the web manifest, the Open Graph image and every page's metadata read it from here.
 * Before this, the sidebar and the sign-in pages drew a "visible" + "au" wordmark and the public site
 * "VisibleAU", months after the product became Vunnara.
 *
 * The React mark, wordmark and logo are components/shared/brand-logo.tsx, drawn from these constants (kept apart so
 * the emails, the PDF and the metadata import no JSX).
 *
 * The icon and share-image files are drawn from this module by scripts/brand/generate-brand-assets.tsx
 * (`pnpm brand:assets`), and tests/unit/brand/brand-assets.test.ts fails when a committed file isn't what it
 * draws now.
 */
import { PRODUCT_NAME } from "@/lib/product";

export { PRODUCT_NAME };

/** What Vunnara does, in one line: the metadata description, the share image, the manifest, the email footer. */
export const PRODUCT_TAGLINE = "AI search visibility for Australian businesses";

/** A page's title when it names none of its own. */
export const DEFAULT_PAGE_TITLE = `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`;

/** The description a public page shares when it has none of its own. */
export const PRODUCT_DESCRIPTION =
  "See whether ChatGPT, Claude, Gemini and Perplexity name your business, and what to fix when they don't.";

/**
 * The mark's colours: the PDF's brand blue (lib/reports/pdf/tokens.ts reads it from here) with a white "V".
 * White on it is 5.2:1 (AA for text); the square is 3.9:1 on the dark theme's page and 4.9:1 on the light
 * one (above the 3:1 a graphic needs). app/globals.css sets --brand-mark and --brand-mark-fg to these in both
 * themes (tests/unit/brand/brand-mark.test.tsx checks they match and their contrast).
 */
export const BRAND_COLORS = {
  mark: "#2563EB",
  markFg: "#FFFFFF",
  /** Behind the app icons and the share image: the dark theme's page. */
  ground: "#09090B",
} as const;

/**
 * The mark's drawing on a 32-unit square: the PDF's corner (28% of the side) and its letter, Inter Bold's "V"
 * (lib/reports/pdf/fonts/inter/Inter-Bold.ttf, the PDF's own font) at the PDF's size -- cap height 45% of
 * the side -- centred.
 */
export const BRAND_MARK = {
  /** The letter, where the mark is drawn as text (the email header: mail clients don't draw SVG). */
  letter: PRODUCT_NAME.charAt(0),
  viewBox: 32,
  radius: 9,
  glyphPath:
    "M14.13 23.2L9.09 8.8L12.36 8.8L14.66 15.75Q15.08 17.06 15.5 18.64Q15.93 20.22 16.4 22.1L15.76 22.1Q16.23 20.2 16.63 18.63Q17.04 17.06 17.44 15.75L19.66 8.8L22.91 8.8L17.99 23.2Z",
} as const;

/**
 * The mark as a standalone SVG file: app/icon.svg, and what each PNG icon is drawn from. `rounded: false` fills
 * the whole square (Apple's touch icon and the maskable icon, which the device rounds itself).
 */
export function brandMarkSvg({
  size = 32,
  rounded = true,
}: {
  size?: number;
  rounded?: boolean;
} = {}) {
  const box = BRAND_MARK.viewBox;
  const rx = rounded ? BRAND_MARK.radius : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${box} ${box}"><rect width="${box}" height="${box}" rx="${rx}" fill="${BRAND_COLORS.mark}"/><path d="${BRAND_MARK.glyphPath}" fill="${BRAND_COLORS.markFg}"/></svg>\n`;
}

/** How a downloaded export's file name starts: "vunnara-audit-50.csv", "vunnara-export-2026-11-15.csv". */
export const EXPORT_FILE_PREFIX = PRODUCT_NAME.toLowerCase();

/** The manifest's icons (public/icons/, drawn by scripts/brand/generate-brand-assets.tsx). */
export const BRAND_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
] as const;

/**
 * The image a shared link shows (Open Graph and Twitter): a fixed file in public/, named in the root layout's
 * metadata and in every public page's (lib/seo/metadata.ts). Not the opengraph-image file convention: a page
 * that sets its own openGraph replaces the root's file image, and a generated route has no file extension,
 * so the middleware would send a social crawler to sign-in.
 */
export const OG_IMAGE = {
  url: "/og/vunnara.png",
  width: 1200,
  height: 630,
  alt: `${PRODUCT_NAME}: ${PRODUCT_TAGLINE}`,
} as const;
