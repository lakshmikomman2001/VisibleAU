/**
 * 2 Nov -- what Settings -> Report branding's preview needs from production's
 * own configuration, which `next dev` and vitest don't apply:
 * - vercel.json sends X-Frame-Options: DENY on every path, which would blank
 *   the preview's frame: a later rule relaxes it to SAMEORIGIN for the
 *   preview's path alone (a later matching rule wins for the same header);
 * - the PDF's fonts are read from disk, so the preview route has to ship them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

describe("the preview's frame on Vercel", () => {
  it("the preview's path alone is SAMEORIGIN, in a rule after the global DENY", () => {
    const frameRules = vercel.headers
      .map((rule, order) => ({
        source: rule.source,
        order,
        value: rule.headers.find((h) => h.key === "X-Frame-Options")?.value,
      }))
      .filter((rule) => rule.value);
    expect(frameRules.map((r) => [r.source, r.value])).toEqual([
      ["/(.*)", "DENY"],
      ["/api/report-branding/preview", "SAMEORIGIN"],
    ]);
    expect(frameRules[1].order).toBeGreaterThan(frameRules[0].order);
  });
});

describe("the preview's fonts on Vercel", () => {
  it("are traced into the preview route, as they are into the Inngest route", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    for (const route of ["/api/webhooks/inngest", "/api/report-branding/preview"]) {
      expect(config, route).toContain(`"${route}": ["./lib/reports/pdf/fonts/**/*"]`);
    }
  });
});
