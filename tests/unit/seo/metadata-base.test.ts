/**
 * Regression follow-ups (9 Nov), part 4 -- the build warned "metadataBase not set": every relative Open
 * Graph / Twitter / canonical URL fell back to http://localhost:3000, and buildMetadata's canonical links
 * named the old visibleau.com when NEXT_PUBLIC_APP_URL wasn't set. Every public page's URLs are now the
 * production site's, from one constant (lib/product.ts SITE_URL), whatever environment built it.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";
import { PRODUCT_NAME, SITE_URL } from "@/lib/product";
import { buildMetadata } from "@/lib/seo/metadata";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const PUBLIC_PAGES: Record<
  string,
  () => Promise<{ metadata?: Metadata; generateMetadata?: () => Metadata }>
> = {
  "/": () => import("@/app/(marketing)/page"),
  "/about": () => import("@/app/(marketing)/about/page"),
  "/methodology": () => import("@/app/(marketing)/methodology/page"),
  "/pricing": () => import("@/app/(marketing)/pricing/page"),
  "/privacy": () => import("@/app/(marketing)/privacy/page"),
  "/terms": () => import("@/app/(marketing)/terms/page"),
};

async function pageMetadata(path: string): Promise<Metadata> {
  const mod = await PUBLIC_PAGES[path]();
  const meta = mod.generateMetadata ? mod.generateMetadata() : mod.metadata;
  if (!meta) throw new Error(`${path} sets no metadata`);
  return meta;
}

describe("the production site's address", () => {
  it("is https://vunnara.com.au, the domain the contact addresses use", async () => {
    const { CONTACT_DOMAIN } = await import("@/lib/product");
    expect(SITE_URL).toBe("https://vunnara.com.au");
    expect(new URL(SITE_URL).hostname).toBe(CONTACT_DOMAIN);
  });

  it("is the root layout's metadataBase, so every page below it resolves relative URLs there", async () => {
    const { metadata } = await import("@/app/layout");
    expect(String(metadata.metadataBase)).toBe("https://vunnara.com.au/");
    expect(metadata.title).toBe(PRODUCT_NAME);
  }, 30_000);
});

describe("each public page's metadata", () => {
  it.each(
    Object.keys(PUBLIC_PAGES),
  )("%s: canonical and og:url are on https://vunnara.com.au", async (path) => {
    const meta = await pageMetadata(path);
    const expected = `https://vunnara.com.au${path}`;
    expect(meta.alternates?.canonical).toBe(expected);
    expect((meta.openGraph as { url?: string } | undefined)?.url).toBe(expected);
    expect(String(meta.title)).toContain(PRODUCT_NAME);
    expect(JSON.stringify(meta)).not.toMatch(/visibleau|localhost/i);
  }, 30_000);

  it("stays on the production site when the environment names another address", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://my-preview.vercel.app");
    try {
      expect(buildMetadata({ title: "About", path: "/about" }).alternates.canonical).toBe(
        "https://vunnara.com.au/about",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("names no image that isn't in public/", () => {
    const meta = buildMetadata({ path: "/" }) as { openGraph: { images?: string[] } };
    for (const image of meta.openGraph.images ?? []) {
      expect(existsSync(join(process.cwd(), "public", image)), image).toBe(true);
    }
  });
});
