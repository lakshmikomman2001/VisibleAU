// @vitest-environment jsdom
/**
 * 17 Nov, part 4 -- a brand's avatar colour comes from the brand (a hash of its id), never its place in a list: Omega
 * Services' went from purple to teal when other brands were deleted (GRADIENTS[i % 5]), and the brand page always used
 * the first gradient. Every brand avatar -- the brands list, the brand row, the brand page -- uses the one function, and
 * the white initials are AA on every colour in both themes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { BRAND_AVATAR_GRADIENTS, brandAvatarBackground } from "@/lib/brands/avatar-color";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const OMEGA = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const OTHERS = [
  "0a1b2c3d-1111-4222-8333-444455556666",
  "1b2c3d4e-2222-4333-8444-555566667777",
  "2c3d4e5f-3333-4444-8555-666677778888",
];

describe("a brand's colour is its own", () => {
  it("the same brand gets the same colour every time", () => {
    expect(brandAvatarBackground(OMEGA)).toBe(brandAvatarBackground(OMEGA));
    expect(BRAND_AVATAR_GRADIENTS).toContain(brandAvatarBackground(OMEGA));
  });

  it("deleting or adding another brand doesn't change it", () => {
    const before = [OMEGA, ...OTHERS].map((id) => [id, brandAvatarBackground(id)] as const);
    // Delete two brands, add one: the list's order and length change.
    const after = ["9d8c7b6a-5555-4666-8777-888899990000", OTHERS[2], OMEGA].map(
      (id) => [id, brandAvatarBackground(id)] as const,
    );
    const colourOf = (list: ReadonlyArray<readonly [string, string]>, id: string) =>
      list.find(([i]) => i === id)?.[1];
    expect(colourOf(after, OMEGA)).toBe(colourOf(before, OMEGA));
    expect(colourOf(after, OTHERS[2])).toBe(colourOf(before, OTHERS[2]));
  });

  it("spreads brands over all five colours", () => {
    const seen = new Set<string>();
    for (let n = 0; n < 200; n++) seen.add(brandAvatarBackground(`brand-${n}-${n * 7919}`));
    expect(seen.size).toBe(5);
  });
});

describe("the initials are AA on every colour, in both themes", () => {
  const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");
  const luminance = (hex: string) => {
    const c = [1, 3, 5].map((i) => {
      const s = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  for (const theme of ["dark", "light"] as const) {
    it(`${theme}: white on every stop of gradients 1-5 is at least 4.5:1`, () => {
      const blocks = [
        ...CSS.matchAll(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`, "g")),
      ]
        .map((m) => m[1])
        .join("\n");
      const fg = blocks.match(/--avatar-fg:\s*(#[0-9a-fA-F]{6})/)?.[1];
      expect(fg, `${theme} --avatar-fg`).toBe("#ffffff");
      for (let n = 1; n <= 5; n++) {
        const gradient = blocks.match(new RegExp(`--avatar-gradient-${n}:\\s*([^;]+);`))?.[1] ?? "";
        const stops = gradient.match(/#[0-9a-fA-F]{6}/g) ?? [];
        expect(stops.length, `${theme} gradient ${n}`).toBeGreaterThan(0);
        for (const stop of stops)
          expect(contrast(fg as string, stop), `${theme} ${n} ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
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
