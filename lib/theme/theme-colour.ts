/**
 * GST-free pricing (11 Nov), part 2 -- a theme token's value now, for a library that needs a literal colour
 * rather than var(--token): react-joyride derives its beacon's colour from a hex (hexToRGB). Undefined where
 * there's no document (server rendering), so the library falls back to its own default.
 */
export function themeColour(token: `--${string}`): string | undefined {
  if (typeof document === "undefined") return undefined;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value === "" ? undefined : value;
}
