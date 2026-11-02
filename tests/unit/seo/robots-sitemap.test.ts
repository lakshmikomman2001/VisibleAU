/**
 * 3 Nov -- robots.txt and sitemap.xml were untracked files a local build had
 * generated for http://localhost:3000, and middleware sent both paths to /sign-in on
 * production, so crawlers got neither. These check what ships: the right site, every
 * private area disallowed, and the two paths actually answering.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

const ROOT = join(__dirname, "../../..");
const SITE = "https://vunnara.com.au";
const robots = () => readFileSync(join(ROOT, "public/robots.txt"), "utf8");
const sitemap = () => readFileSync(join(ROOT, "public/sitemap.xml"), "utf8");

/** Everything behind sign-in, plus the signed-link and account pages. */
function privateRoutes(): string[] {
  const authDir = join(ROOT, "app/(auth)");
  const signedIn = readdirSync(authDir)
    .filter((entry) => statSync(join(authDir, entry)).isDirectory())
    .map((entry) => `/${entry}`);
  return [
    ...signedIn,
    "/api/",
    "/client-portal",
    "/invite",
    "/no-workspace",
    "/reset-password",
    "/forgot-password",
    "/sample-audit/result",
    "/sample-audit/running",
  ];
}

/** The marketing pages with fixed addresses: what a sitemap can list. */
function marketingPages(): string[] {
  const dir = join(ROOT, "app/(marketing)");
  const out: string[] = [];
  const walk = (path: string, route: string) => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) walk(full, `${route}/${entry}`);
      else if (entry === "page.tsx") out.push(route || "/");
    }
  };
  walk(dir, "");
  return out.filter((route) => !route.includes("[") && !route.endsWith("/running"));
}

const sitemapUrls = () => [...sitemap().matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("robots.txt", () => {
  it("names this site's sitemap, and nothing of the old name or a local one", () => {
    expect(robots()).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(robots()).not.toMatch(/localhost|visibleau/i);
  });

  it("disallows every private area", () => {
    const disallowed = robots()
      .split(/\r?\n/)
      .filter((line) => line.startsWith("Disallow: "))
      .map((line) => line.slice("Disallow: ".length).trim());
    for (const route of privateRoutes()) expect(disallowed).toContain(route);
  });

  it("has one group, so a crawler can't read a broader rule first", () => {
    expect(robots().match(/^User-agent:/gm)).toHaveLength(1);
  });
});

describe("sitemap.xml", () => {
  it("lists this site's addresses only, and at least one", () => {
    const urls = sitemapUrls();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith(SITE)).toBe(true);
    expect(sitemap()).not.toMatch(/localhost|visibleau/i);
  });

  it("lists exactly the marketing pages with fixed addresses", () => {
    const listed = sitemapUrls().map((url) => url.slice(SITE.length) || "/");
    expect([...listed].sort()).toEqual([...marketingPages()].sort());
  });

  it("lists nothing private", () => {
    for (const url of sitemapUrls()) {
      const path = url.slice(SITE.length);
      for (const route of privateRoutes()) expect(path.startsWith(route)).toBe(false);
    }
  });
});

describe("they're served", () => {
  const answer = (path: string) => middleware(new NextRequest(`${SITE}${path}`));

  it.each(["/robots.txt", "/sitemap.xml"])("%s isn't sent to sign-in", async (path) => {
    const res = await answer(path);
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("a private page signed out still is", async () => {
    const res = await answer("/dashboard");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/sign-in");
  });

  it("nothing regenerates them at build time and overwrites these", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.postbuild).toBeUndefined();
    expect(existsSync(join(ROOT, "next-sitemap.config.js"))).toBe(false);
  });
});
