/**
 * Playwright-run follow-ups (10 Nov), part 8 -- region pricing. The middleware detected the region and set
 * x-visibleau-region on the RESPONSE, but the pricing page reads request headers (`headers()`), so it never saw
 * it and every visitor got the AU page. And `request.geo`, its only source besides a /au/-style path prefix,
 * was removed in Next 15, so the country was never known either. Now the region is set on the request, from
 * Vercel's x-vercel-ip-country header (what @vercel/functions' geolocation() reads), under one name.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { REGION_HEADER } from "@/lib/region/header";
import { middleware } from "@/middleware";
import { NON_TEST_ROOTS, readSourcesBeforeAll, sourceFiles } from "@/tests/helpers/source-files";

const THIS_FILE = "tests/unit/middleware/region-header.test.ts";
readSourcesBeforeAll([...NON_TEST_ROOTS, "tests"]);

const visit = (url: string, headers: Record<string, string> = {}) =>
  middleware(new NextRequest(`http://localhost:3000${url}`, { headers }));

/** The region the page will see: the middleware's request-header override. */
const regionSeenByPage = (res: Response) =>
  res.headers.get(`x-middleware-request-${REGION_HEADER}`);

describe("the region reaches the page, on the request", () => {
  it("is one constant, x-vunnara-region", () => {
    expect(REGION_HEADER).toBe("x-vunnara-region");
  });

  it.each([
    ["AU", "au"],
    ["NZ", "nz"],
    ["GB", "uk"],
    ["US", "us"],
    ["CA", "ca"],
    ["DE", "eu"],
    ["JP", "au"],
  ])("a visitor from %s sees the %s pricing page", async (country, region) => {
    const res = await visit("/pricing", { "x-vercel-ip-country": country });
    expect(regionSeenByPage(res)).toBe(region);
    expect(res.headers.get("x-middleware-override-headers")).toContain(REGION_HEADER);
  });

  it("with no country known, the AU page", async () => {
    expect(regionSeenByPage(await visit("/pricing"))).toBe("au");
  });

  it("a visitor can't pick a region by sending the header themselves", async () => {
    const res = await visit("/pricing", { "x-vercel-ip-country": "AU", [REGION_HEADER]: "uk" });
    expect(regionSeenByPage(res)).toBe("au");
  });

  it("signed-in pages get it too", async () => {
    const res = await visit("/dashboard", {
      cookie: "better-auth.session_token=abc.def",
      "x-vercel-ip-country": "NZ",
    });
    expect(regionSeenByPage(res)).toBe("nz");
  });

  it("it's no longer put on the response, where no page could read it", async () => {
    const res = await visit("/pricing", { "x-vercel-ip-country": "NZ" });
    expect(res.headers.get(REGION_HEADER)).toBeNull();
    expect(res.headers.get("x-visibleau-region")).toBeNull();
  });
});

describe("one name for it", () => {
  it("the pricing page and the middleware use the constant", () => {
    const pricing = readFileSync(join(process.cwd(), "app/(marketing)/pricing/page.tsx"), "utf8");
    expect(pricing).toMatch(/headerList\.get\(REGION_HEADER\)/);
    const mw = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");
    expect(mw).toMatch(/requestHeaders\.set\(REGION_HEADER, region\)/);
    expect(mw).not.toMatch(/["']x-vunnara-region["']/);
  });

  it("the old header name is nowhere in the code or the tests (this file and the archive aside)", () => {
    const OLD = ["x", "visibleau", "region"].join("-");
    const offenders = sourceFiles([...NON_TEST_ROOTS, "tests"])
      .filter((f) => !f.path.includes("/_archive/") && f.path !== THIS_FILE)
      .filter((f) => f.text.includes(OLD))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
