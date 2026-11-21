/**
 * S00 part 0b (22 Nov), decision D-UI1 (docs/prototypes/vunnara-ui-config.ts, conflict C-11): a form control's
 * boundary is --border-control, 3:1 or more on every surface a control sits on, in both themes (WCAG 2.2
 * 1.4.11). --border-default, which inputs used, was about 1.2:1. The contract's other new tokens are here too,
 * named the app's way (docs/prototypes/token-map.md, T-01 and T-02): --agency on its --agency-soft pill, and
 * --warning-fg, the glyph on a solid --warning disc (the contract's --on-status).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "../../helpers/source-files";

const CSS = readFileSync(resolve(__dirname, "../../../app/globals.css"), "utf-8");
type Theme = "dark" | "light";
const THEMES: readonly Theme[] = ["dark", "light"];
/** The surfaces a form control sits on: the page, the sidebar and panels, cards, a hovered row. */
const CONTROL_SURFACES = ["--bg-base", "--bg-subtle", "--bg-elevated", "--bg-hover"] as const;

/** Every `--name: #rrggbb` in the theme's [data-theme="…"] blocks. */
function hexTokens(theme: Theme): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, body] of CSS.matchAll(
    new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`, "g"),
  ))
    for (const [, name, hex] of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g))
      tokens.set(name, hex.toLowerCase());
  return tokens;
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

describe("D-UI1: form control boundaries are 3:1 on every surface (WCAG 1.4.11)", () => {
  for (const theme of THEMES) {
    it(`${theme}: --border-control is at least 3:1 on every surface a control sits on`, () => {
      const tokens = hexTokens(theme);
      const control = tokens.get("--border-control");
      expect(control, `${theme} --border-control`).toMatch(/^#[0-9a-f]{6}$/);
      const below = CONTROL_SURFACES.flatMap((surface) => {
        const ratio = contrast(control as string, tokens.get(surface) as string);
        return ratio < 3 ? [`${surface}: ${ratio.toFixed(2)}:1`] : [];
      });
      expect(below).toEqual([]);
    });

    it(`${theme}: a switch's knob is at least 3:1 on its off track`, () => {
      const tokens = hexTokens(theme);
      const ratio = contrast(
        tokens.get("--switch-thumb") as string,
        tokens.get("--border-control") as string,
      );
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  }

  it("the contract's values: --border-control #8a8a93 light, #71717a dark", () => {
    expect(hexTokens("light").get("--border-control")).toBe("#8a8a93");
    expect(hexTokens("dark").get("--border-control")).toBe("#71717a");
  });

  it("on a text input, textarea or select, the border names an inline style uses are --border-control", () => {
    const rule = CSS.match(/((?:input:not\([^)]*\))+[^{]*,\s*textarea,\s*select)\s*\{([^}]*)\}/);
    expect(rule, "the D-UI1 rule in app/globals.css").not.toBeNull();
    const [, selector, body] = rule as RegExpMatchArray;
    for (const kept of ["checkbox", "radio", "button", "submit", "reset", "hidden", "file"])
      expect(selector).toContain(`:not([type="${kept}"])`);
    for (const name of ["--border-default", "--border-strong", "--border-subtle"])
      expect(body).toMatch(new RegExp(`${name}:\\s*var\\(--border-control\\);`));
  });
});

readSourcesBeforeAll(["app", "components"]);

describe("D-UI1: every switch's off track is --border-control", () => {
  it('each role="switch" in the app sets its off track to var(--border-control)', () => {
    const files = sourcePaths(["app", "components"], /\.tsx$/).filter((p) =>
      sourceText(p).includes('role="switch"'),
    );
    expect(files.length).toBeGreaterThanOrEqual(2);
    const without = files.filter((p) => !sourceText(p).includes('"var(--border-control)"'));
    expect(without).toEqual([]);
  });
});

describe("the UI contract's other new tokens, the app's way (token-map.md T-01, T-02)", () => {
  const CONTRACT: Record<Theme, Record<string, string>> = {
    light: { "--agency": "#6d28d9", "--agency-soft": "#f5f3ff", "--warning-fg": "#ffffff" },
    dark: { "--agency": "#c4b5fd", "--agency-soft": "#211a3a", "--warning-fg": "#0a0a0b" },
  };
  for (const theme of THEMES) {
    it(`${theme}: --agency, --agency-soft and --warning-fg have the contract's values`, () => {
      const tokens = hexTokens(theme);
      for (const [name, hex] of Object.entries(CONTRACT[theme]))
        expect(tokens.get(name), name).toBe(hex);
    });

    it(`${theme}: agency text is at least 4.5:1 on its pill, and the warning glyph on its disc`, () => {
      const tokens = hexTokens(theme);
      const pill = contrast(
        tokens.get("--agency") as string,
        tokens.get("--agency-soft") as string,
      );
      const glyph = contrast(
        tokens.get("--warning-fg") as string,
        tokens.get("--warning") as string,
      );
      expect(pill).toBeGreaterThanOrEqual(4.5);
      expect(glyph).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("no second name for the same token: the contract's --agency-tint and --on-status aren't defined", () => {
    expect(CSS).not.toMatch(/--agency-tint:|--on-status:/);
  });
});
