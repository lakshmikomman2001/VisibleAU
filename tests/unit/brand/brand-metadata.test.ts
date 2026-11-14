/**
 * Rebrand (15 Nov), part 1 -- what a browser tab, a home screen and a shared link show: the root layout's and
 * every public page's metadata (title, description, Open Graph, Twitter), the web manifest and the icons all
 * say Vunnara, from lib/brand.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";
import manifest from "@/app/manifest";
import {
  BRAND_ICONS,
  brandMarkSvg,
  DEFAULT_PAGE_TITLE,
  OG_IMAGE,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
} from "@/lib/brand";
import { buildMetadata } from "@/lib/seo/metadata";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const OLD_NAME = /visible[\s_.-]?au/i;
const file = (path: string) => readFileSync(join(process.cwd(), path));

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("the root layout's metadata", () => {
  it("names the product in the title (and as the template), the application, Open Graph and Twitter", async () => {
    const { metadata } = (await import("@/app/layout")) as { metadata: Metadata };
    expect(metadata.applicationName).toBe(PRODUCT_NAME);
    expect(metadata.title).toEqual({ default: PRODUCT_NAME, template: `%s | ${PRODUCT_NAME}` });
    expect(metadata.description).toBe(PRODUCT_TAGLINE);
    const og = metadata.openGraph as {
      siteName: string;
      title: string;
      images: Array<typeof OG_IMAGE>;
    };
    expect(og.siteName).toBe(PRODUCT_NAME);
    expect(og.title).toBe(DEFAULT_PAGE_TITLE);
    expect(og.images).toEqual([OG_IMAGE]);
    const twitter = metadata.twitter as {
      card: string;
      title: string;
      images: Array<{ url: string }>;
    };
    expect(twitter.card).toBe("summary_large_image");
    expect(twitter.title).toBe(DEFAULT_PAGE_TITLE);
    expect(twitter.images[0].url).toBe(OG_IMAGE.url);
    expect(JSON.stringify(metadata)).not.toMatch(OLD_NAME);
  }, 30_000);
});

describe("a public page's metadata (buildMetadata)", () => {
  it("is '<page> | Vunnara', shares the same image on Open Graph and Twitter, and siteName is Vunnara", () => {
    const meta = buildMetadata({ title: "Pricing", path: "/pricing" });
    expect(meta.title).toEqual({ absolute: `Pricing | ${PRODUCT_NAME}` });
    expect(meta.openGraph.title).toBe(`Pricing | ${PRODUCT_NAME}`);
    expect(meta.openGraph.siteName).toBe(PRODUCT_NAME);
    expect(meta.openGraph.images).toEqual([OG_IMAGE]);
    expect(meta.twitter.images[0]).toEqual({ url: OG_IMAGE.url, alt: OG_IMAGE.alt });
    expect(JSON.stringify(meta)).not.toMatch(OLD_NAME);
  });

  it("the home page's title is the product and its line", () => {
    expect(buildMetadata({ path: "/" }).title).toEqual({ absolute: DEFAULT_PAGE_TITLE });
    expect(DEFAULT_PAGE_TITLE).toBe(`${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`);
  });
});

describe("the share image", () => {
  it("is a 1200 x 630 PNG in public/, with alt text naming the product", () => {
    const png = file(`public${OG_IMAGE.url}`);
    expect(pngSize(png)).toEqual({ width: OG_IMAGE.width, height: OG_IMAGE.height });
    expect(OG_IMAGE.alt).toBe(`${PRODUCT_NAME}: ${PRODUCT_TAGLINE}`);
  });
});

describe("the web manifest and the icons", () => {
  it("the manifest names the product and lists icons that exist at their stated sizes", () => {
    const m = manifest();
    expect(m.name).toBe(PRODUCT_NAME);
    expect(m.short_name).toBe(PRODUCT_NAME);
    expect(m.description).toBe(PRODUCT_TAGLINE);
    expect(m.icons).toHaveLength(BRAND_ICONS.length);
    for (const icon of m.icons ?? []) {
      const [w, h] = String(icon.sizes).split("x").map(Number);
      expect(pngSize(file(`public${icon.src}`)), icon.src).toEqual({ width: w, height: h });
    }
  });

  it("app/icon.svg is the mark, and the favicon holds it at 16, 32 and 48 px", () => {
    expect(file("app/icon.svg").toString("utf-8")).toBe(brandMarkSvg());
    const ico = file("app/favicon.ico");
    expect(ico.readUInt16LE(2)).toBe(1); // an icon
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + i * 16));
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("the Apple touch icon is 180 px", () => {
    expect(pngSize(file("app/apple-icon.png"))).toEqual({ width: 180, height: 180 });
  });

  it("the manifest is a public route: a browser asks for it before anyone signs in", () => {
    const middleware = readFileSync(join(process.cwd(), "middleware.ts"), "utf-8");
    expect(middleware).toContain('"/manifest.webmanifest"');
    expect(existsSync(join(process.cwd(), "public", "manifest.webmanifest"))).toBe(false);
  });
});
