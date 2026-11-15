/**
 * A brand's avatar colour, from the brand itself (17 Nov, part 4: a hash of its id, never its place in a list).
 *
 * Leftovers task, part 4 (17 Nov): five gradients meant two of a handful of brands often shared one (Hero Home
 * Services and Omega Services were both orange). The hash now picks a hue anywhere on the colour wheel and one of
 * three lightness tones, so two brands share a colour only when their hashes land within a few degrees in the same
 * tone. Each stop is an OKLCH colour dark enough that the white initials (--avatar-fg, the same in both themes) are
 * at least 4.5:1 on it whatever the hue (tests/unit/brands/avatar-color.test.tsx checks every hue and tone, after
 * the browser maps a colour into sRGB). The same id gives the same colour on the server and in the browser.
 */

/** Lightness of each gradient's two stops, and the chroma, per tone (OKLCH). */
export const BRAND_AVATAR_TONES = [
  { from: 0.52, to: 0.44 },
  { from: 0.46, to: 0.38 },
  { from: 0.4, to: 0.33 },
] as const;
export const BRAND_AVATAR_CHROMA = 0.13;
/** How far the gradient's second stop turns from the first, in degrees. */
export const BRAND_AVATAR_HUE_TURN = 18;

/** FNV-1a, 32-bit: the same id gives the same number, on the server and in the browser. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface BrandAvatarColour {
  /** 0-359.9, a tenth of a degree. */
  hue: number;
  tone: number;
}

export function brandAvatarColour(brandId: string): BrandAvatarColour {
  const h = hash(brandId);
  return { hue: (h % 3600) / 10, tone: Math.floor(h / 3600) % BRAND_AVATAR_TONES.length };
}

export function brandAvatarBackground(brandId: string): string {
  const { hue, tone } = brandAvatarColour(brandId);
  const { from, to } = BRAND_AVATAR_TONES[tone];
  const turned = (hue + BRAND_AVATAR_HUE_TURN) % 360;
  return `linear-gradient(135deg, oklch(${from} ${BRAND_AVATAR_CHROMA} ${hue}), oklch(${to} ${BRAND_AVATAR_CHROMA} ${turned}))`;
}
