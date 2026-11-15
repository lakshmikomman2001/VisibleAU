/**
 * 17 Nov, part 4 -- a brand's avatar colour, from the brand itself: a hash of its id picks one of the five brand
 * gradients (app/globals.css --avatar-gradient-1..5; 6 and 7 are the workspace's and the user's avatars). It came from
 * the brand's position in a list (GRADIENTS[i % 5]), so Omega Services went from purple to teal when other brands were
 * deleted, and the brand page always used the first gradient. White initials (--avatar-fg) are AA on every stop of all
 * five, in both themes (tests/unit/brands/avatar-color.test.ts).
 */
export const BRAND_AVATAR_GRADIENTS = [
  "var(--avatar-gradient-1)",
  "var(--avatar-gradient-2)",
  "var(--avatar-gradient-3)",
  "var(--avatar-gradient-4)",
  "var(--avatar-gradient-5)",
] as const;

/** FNV-1a, 32-bit: the same id gives the same number, on the server and in the browser. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function brandAvatarBackground(brandId: string): string {
  return BRAND_AVATAR_GRADIENTS[hash(brandId) % BRAND_AVATAR_GRADIENTS.length];
}
