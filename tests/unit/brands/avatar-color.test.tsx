// @vitest-environment jsdom
/**
 * 17 Nov, part 4 -- a brand's avatar colour comes from the brand (a hash of its id), never its place in a list: Omega
 * Services' went from purple to teal when other brands were deleted (GRADIENTS[i % 5]), and the brand page always used
 * the first gradient. Every brand avatar -- the brands list, the brand row, the brand page -- uses the one function, and
 * the white initials are AA on every colour in both themes.
 *
 * Leftovers task, part 4 (17 Nov): five gradients made two of a few brands share one (Hero Home Services and Omega
 * Services were both orange; two of three brands share one 52% of the time). The hash now picks a hue anywhere on the
 * wheel and one of three tones -- still from the id alone.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import {
  BRAND_AVATAR_CHROMA,
  BRAND_AVATAR_HUE_TURN,
  BRAND_AVATAR_TONES,
  brandAvatarBackground,
  brandAvatarColour,
} from "@/lib/brands/avatar-color";

/** Stable test ids (UUID-shaped, from a seed): the same every run. */
const ids = (n: number, seed: string) =>
  Array.from({ length: n }, (_, i) => {
    const h = createHash("sha256").update(`${seed}:${i}`).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
  });

const OMEGA = "3ed7f357-3ddf-4ecd-8116-a6c232cccf27";

/** OKLCH -> linear sRGB (Björn Ottosson's OKLab matrices). */
function oklchToLinear(L: number, c: number, hueDeg: number): [number, number, number] {
  const h = (hueDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-6 && v <= 1 + 1e-6);
/** What the browser draws: chroma reduced at the same lightness and hue until the colour fits sRGB. */
function drawn(L: number, c: number, hue: number): [number, number, number] {
  if (inGamut(oklchToLinear(L, c, hue))) return oklchToLinear(L, c, hue);
  let lo = 0;
  let hi = c;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear(L, mid, hue))) lo = mid;
    else hi = mid;
  }
  return oklchToLinear(L, lo, hue);
}
const contrastOfWhite = ([r, g, b]: number[]) =>
  1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);

/** How far apart two avatars' first stops are, in OKLab. */
function distance(x: string, y: string): number {
  const lab = (id: string) => {
    const { hue, tone } = brandAvatarColour(id);
    const h = (hue * Math.PI) / 180;
    return [
      BRAND_AVATAR_TONES[tone].from,
      BRAND_AVATAR_CHROMA * Math.cos(h),
      BRAND_AVATAR_CHROMA * Math.sin(h),
    ];
  };
  const [a, b] = [lab(x), lab(y)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
/** Below this, two avatars side by side look alike. */
const LOOK_ALIKE = 0.03;

function shareWithALookAlike(brands: number, trials: number): number {
  let alike = 0;
  for (let t = 0; t < trials; t++) {
    const set = ids(brands, `set-${brands}-${t}`);
    let any = false;
    for (let i = 0; i < set.length && !any; i++)
      for (let j = i + 1; j < set.length && !any; j++) any = distance(set[i], set[j]) < LOOK_ALIKE;
    if (any) alike++;
  }
  return alike / trials;
}

describe("a brand's colour is its own", () => {
  it("the same brand gets the same colour every time, from its id", () => {
    expect(brandAvatarBackground(OMEGA)).toBe(brandAvatarBackground(OMEGA));
    expect(brandAvatarBackground(OMEGA)).toMatch(/^linear-gradient\(135deg, oklch\(/);
  });

  it("deleting or adding another brand doesn't change it", () => {
    const before = brandAvatarBackground(OMEGA);
    for (const other of ids(30, "others")) brandAvatarBackground(other);
    expect(brandAvatarBackground(OMEGA)).toBe(before);
  });

  it("spreads brands round the whole colour wheel and over all three tones", () => {
    const cols = ids(600, "spread").map(brandAvatarColour);
    for (let sector = 0; sector < 12; sector++) {
      expect(
        cols.some((c) => c.hue >= sector * 30 && c.hue < (sector + 1) * 30),
        `hues ${sector * 30}+`,
      ).toBe(true);
    }
    expect(new Set(cols.map((c) => c.tone)).size).toBe(BRAND_AVATAR_TONES.length);
  });

  // Leftovers task, part 4: with five gradients, two of three brands shared one 52% of the time. From the id alone no
  // palette can keep 25 brands apart (25 brands are 300 pairs, against roughly 80 clearly different dark colours):
  // the rate of some look-alike pair, from 2,000 seeded workspaces each.
  it("a look-alike pair is rare for a few brands, and as rare as the id alone allows for more", () => {
    expect(shareWithALookAlike(2, 2000)).toBeLessThan(0.04);
    expect(shareWithALookAlike(3, 2000)).toBeLessThan(0.1);
    expect(shareWithALookAlike(5, 2000)).toBeLessThan(0.3);
  });
});

describe("the initials are AA on every colour, in both themes", () => {
  it("the initials are white in both themes", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const fg = [...css.matchAll(/--avatar-fg:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(fg.length).toBeGreaterThanOrEqual(2);
    expect(new Set(fg)).toEqual(new Set(["#ffffff"]));
  });

  it("white on both stops of every tone at every hue is at least 4.5:1, as the browser draws it", () => {
    let worst = Number.POSITIVE_INFINITY;
    for (const tone of BRAND_AVATAR_TONES) {
      for (let hue = 0; hue < 360; hue += 0.5) {
        worst = Math.min(
          worst,
          contrastOfWhite(drawn(tone.from, BRAND_AVATAR_CHROMA, hue)),
          contrastOfWhite(drawn(tone.to, BRAND_AVATAR_CHROMA, (hue + BRAND_AVATAR_HUE_TURN) % 360)),
        );
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });
});

describe("every brand avatar uses it", () => {
  it("the brands list, the brand row and the brand page take the brand's colour, never a list index or one fixed gradient", () => {
    for (const file of [
      "app/(auth)/brands/page.tsx",
      "components/domain/brand/brand-row.tsx",
      "components/domain/brand/brand-detail-client.tsx",
    ]) {
      const code = readFileSync(join(process.cwd(), file), "utf-8");
      expect(code, file).toContain("brandAvatarBackground(brand.id)");
      expect(code, file).not.toMatch(/GRADIENTS\[|"var\(--avatar-gradient-[1-5]\)"/);
    }
  });

  it("a brand row's colour doesn't depend on where it sits", async () => {
    const { BrandRow } = await import("@/components/domain/brand/brand-row");
    const brand = {
      id: OMEGA,
      name: "Omega Services",
      domain: "omega.com.au",
      vertical: "tradies",
      region: "au",
      primaryRegions: ["NSW:Norwest"],
      lastAuditScore: null,
      lastAuditAt: null,
      lastAuditStatus: null,
    };
    const first = render(<BrandRow brand={brand} index={0} isLast={false} />);
    const firstAvatar = first.getByText("O");
    const firstBackground = firstAvatar.style.background;
    first.unmount();
    const later = render(<BrandRow brand={brand} index={3} isLast />);
    expect(later.getByText("O").style.background).toBe(firstBackground);
    expect(firstBackground).toBe(brandAvatarBackground(OMEGA));
  });
});
