/**
 * tests/e2e/08-public-assets.spec.ts
 *
 * Playwright-run follow-ups (10 Nov), part 7 -- the AI-crawler tracking snippet was renamed to
 * /vunnara-snippet.js (lib/product.ts TRACKING_SNIPPET_PATH); its old path, /visibleau-snippet.js, serves the
 * same file through next.config.ts's rewrite. Both answered a 307 to /sign-in without a session before.
 * A running server is the only place the rewrite and the public file meet: tests/unit/seo/tracking-snippet
 * checks each half on its own.
 *
 * Stateless: public paths, no session, no data.
 */

import { expect, test } from "@playwright/test";
import { LEGACY_TRACKING_SNIPPET_PATH, SITE_URL, TRACKING_SNIPPET_PATH } from "@/lib/product";

test.describe("The tracking snippet", () => {
  test("both paths serve the same file, without a session", async ({ request }) => {
    const current = await request.get(TRACKING_SNIPPET_PATH, { maxRedirects: 0 });
    const legacy = await request.get(LEGACY_TRACKING_SNIPPET_PATH, { maxRedirects: 0 });

    for (const res of [current, legacy]) {
      expect(res.status(), res.url()).toBe(200);
      expect(res.headers()["content-type"], res.url()).toMatch(/javascript/);
    }
    const body = await current.text();
    expect(await legacy.text()).toBe(body);
    expect(body).toContain(`var VUNNARA_API = "${SITE_URL}/api/visit";`);
  });
});
