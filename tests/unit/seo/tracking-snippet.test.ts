/**
 * Playwright-run follow-ups (10 Nov), part 7 -- the AI-crawler tracking snippet is public/vunnara-snippet.js
 * (it was visibleau-snippet.js), from one constant, lib/product.ts TRACKING_SNIPPET_PATH. The old path serves
 * the same file (a rewrite, not a second copy), and both are public: the middleware answered either one with a
 * 307 to /sign-in when there was no session. The old domain's www redirect is gone from next.config.ts.
 * tests/e2e/08-public-assets.spec.ts fetches both paths from a running server.
 */
import { existsSync } from "node:fs";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { LEGACY_TRACKING_SNIPPET_PATH, TRACKING_SNIPPET_PATH } from "@/lib/product";
import { middleware } from "@/middleware";
import nextConfig from "@/next.config";

describe("the tracking snippet", () => {
  it("is public/vunnara-snippet.js, one file, with no copy at the old path", () => {
    expect(TRACKING_SNIPPET_PATH).toBe("/vunnara-snippet.js");
    expect(LEGACY_TRACKING_SNIPPET_PATH).toBe("/visibleau-snippet.js");
    expect(existsSync(`public${TRACKING_SNIPPET_PATH}`)).toBe(true);
    expect(existsSync(`public${LEGACY_TRACKING_SNIPPET_PATH}`)).toBe(false);
  });

  it("the old path is rewritten to it", async () => {
    const rewrites = await nextConfig.rewrites?.();
    const list = Array.isArray(rewrites)
      ? rewrites
      : [
          ...(rewrites?.beforeFiles ?? []),
          ...(rewrites?.afterFiles ?? []),
          ...(rewrites?.fallback ?? []),
        ];
    expect(list).toContainEqual(
      expect.objectContaining({
        source: LEGACY_TRACKING_SNIPPET_PATH,
        destination: TRACKING_SNIPPET_PATH,
      }),
    );
  });

  it.each([
    TRACKING_SNIPPET_PATH,
    LEGACY_TRACKING_SNIPPET_PATH,
  ])("%s is served without a session, not redirected to sign in", async (path) => {
    const res = await middleware(new NextRequest(`http://localhost:3000${path}`));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("next.config.ts", () => {
  it("has no redirect for the old domain's www host", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(JSON.stringify(redirects)).not.toMatch(/visibleau/i);
  });
});
