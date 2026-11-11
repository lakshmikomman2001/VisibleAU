/**
 * GST-free pricing (11 Nov), part 2 -- no hard-coded colour in component code. 207 hex colours in 40 files
 * (app/ and components/) bypassed the theme: the same dark-theme blue, green, amber and red in both themes, and
 * white text on fills it was 2.2-3.8:1 on. Each is a theme token now (app/globals.css, AA in both themes,
 * tests/unit/design/token-contrast.test.ts), the report PDF's own colours come from lib/pdf/theme.ts, and a
 * library that needs a literal colour reads the token at runtime (lib/theme/theme-colour.ts).
 *
 * The scan: no #rgb / #rrggbb in app/ or components/ (code and CSS) but app/globals.css, comments aside, except
 * the artwork below, each with why.
 */
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "../../helpers/source-files";

const ROOTS = ["app", "components"];
const COMPONENT_FILE = /\.(ts|tsx|js|jsx|css)$/;
const THEME_FILES = new Set(["app/globals.css"]);

/** Colours that aren't the app's theme, each with why. */
const ARTWORK: Record<string, string> = {
  "app/api/badge/route.ts":
    "the SVG badge a business embeds on its own site: an image outside our pages, so no CSS variables",
  "components/domain/landing/engines-supported.tsx":
    "each AI engine's own brand colour beside its name (ChatGPT's green, Claude's orange, ...)",
};

const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/;

readSourcesBeforeAll(ROOTS, COMPONENT_FILE);

/** Code without comments (a hex in an explanation isn't a colour on a page). */
const withoutComments = (text: string) =>
  text
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("no hex colour in component code outside the theme files", () => {
  it("app/ and components/ name colours by theme token (artwork aside, with why)", () => {
    const files = sourcePaths(ROOTS, COMPONENT_FILE);
    expect(files.length).toBeGreaterThan(300);
    const offenders = files
      .filter((path) => !THEME_FILES.has(path) && !ARTWORK[path])
      .flatMap((path) =>
        withoutComments(sourceText(path))
          .split("\n")
          .map((line, i) => ({ line, at: `${path}:${i + 1}` }))
          // A character class like /^#[0-9a-fA-F]{6}$/ (a colour validator) isn't a colour.
          .filter(({ line }) => HEX.test(line.replace(/#\[[^\]]*\]/g, "")))
          .map(({ at, line }) => `${at}  ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it("the artwork list can't rot: each file still has its colours, and says why", () => {
    for (const [path, why] of Object.entries(ARTWORK)) {
      expect(HEX.test(sourceText(path)), path).toBe(true);
      expect(why.length).toBeGreaterThan(20);
    }
  });

  it("the scan sees a hex colour, and not a validator's character class", () => {
    expect(HEX.test('style={{ color: "#3b82f6" }}')).toBe(true);
    expect(HEX.test('background: "#fff"')).toBe(true);
    expect(HEX.test("/^#[0-9a-fA-F]{6}$/".replace(/#\[[^\]]*\]/g, ""))).toBe(false);
    expect(HEX.test('href="#pricing"')).toBe(false);
  });
});
