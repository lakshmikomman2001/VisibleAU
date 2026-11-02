/**
 * 2 Nov -- what Settings -> Report branding's preview needs from production's
 * own configuration, which `next dev` and vitest don't apply.
 *
 * Framing. vercel.json sends X-Frame-Options: DENY, which would blank the
 * preview's frame. Vercel doesn't document which rule wins when two rules set
 * the same header on a path (every rule is its own `continue: true` route), so
 * the config never relies on it: the DENY rule leaves out the preview's exact
 * path, and for any path exactly ONE rule sets a framing policy. The rules are
 * compiled here the way Vercel compiles them (@vercel/routing-utils,
 * sourceToRegex: path-to-regexp, strict, case-sensitive).
 *
 * Fonts. The PDF's fonts are read from disk, so the preview route ships them.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (
    source: string,
    keys: unknown[],
    options: { strict: boolean; sensitive: boolean; delimiter: string },
  ) => RegExp;
};

const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

const PREVIEW = "/api/report-branding/preview";

function matches(source: string, path: string): boolean {
  return pathToRegexp(source, [], { strict: true, sensitive: true, delimiter: "/" }).test(path);
}

/** Every value any matching rule sets for this header on this path, one per rule. */
function headerValues(path: string, key: string): string[] {
  return vercel.headers
    .filter((rule) => matches(rule.source, path))
    .flatMap((rule) =>
      rule.headers.filter((h) => h.key.toLowerCase() === key.toLowerCase()).map((h) => h.value),
    );
}

describe("framing on Vercel: exactly one policy for every path", () => {
  it("the preview's exact path may be framed, by this site only", () => {
    expect(headerValues(PREVIEW, "X-Frame-Options")).toEqual(["SAMEORIGIN"]);
  });

  it.each([
    // The app's main surfaces.
    "/",
    "/dashboard",
    "/settings/report-branding",
    "/client-portal/x",
    "/api/brands",
    "/sign-in",
    "/pricing",
    "/agency/branding",
    "/api/branding/logo/org/file.png",
    // Next to the preview, and spellings of it: none is the preview.
    "/api/report-branding",
    `${PREVIEW}/`,
    `${PREVIEW}/x`,
    `${PREVIEW}x`,
    `/x${PREVIEW}`,
    "/API/report-branding/preview",
    "/api/report-branding/PREVIEW",
  ])("%s is DENY, set by one rule", (path) => {
    expect(headerValues(path, "X-Frame-Options")).toEqual(["DENY"]);
  });

  it("every framing value in the config is DENY, or SAMEORIGIN on the preview's exact path alone", () => {
    const rules = vercel.headers.flatMap((rule) =>
      rule.headers
        .filter((h) => h.key.toLowerCase() === "x-frame-options")
        .map((h) => [rule.source, h.value]),
    );
    expect(rules.filter(([, value]) => value !== "DENY")).toEqual([[PREVIEW, "SAMEORIGIN"]]);
    expect(new Set(rules.map(([, value]) => value))).toEqual(new Set(["DENY", "SAMEORIGIN"]));
  });

  it("no CSP sets frame-ancestors, which browsers would obey over X-Frame-Options", () => {
    for (const rule of vercel.headers) {
      for (const header of rule.headers) {
        expect(header.value.toLowerCase(), rule.source).not.toContain("frame-ancestors");
      }
    }
  });

  it.each([
    PREVIEW,
    "/",
    "/settings/report-branding",
  ])("%s keeps every other security header, one of each", (path) => {
    for (const key of [
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Content-Security-Policy",
    ]) {
      expect(headerValues(path, key), key).toHaveLength(1);
    }
  });

  it("nothing else sets a framing policy: next.config, middleware or the app's code", () => {
    const root = process.cwd();
    const files = ["next.config.ts", "middleware.ts", "instrumentation.ts"].map((f) =>
      join(root, f),
    );
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|js|mjs)$/.test(name)) files.push(path);
      }
    };
    for (const dir of ["app", "lib", "components"]) walk(join(root, dir));

    const setters = files
      .filter((file) => /x-frame-options|frame-ancestors/i.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file).split(sep).join("/"));
    expect(setters).toEqual(["app/api/report-branding/preview/route.ts"]);
  });
});

describe("the preview's fonts on Vercel", () => {
  it("are traced into the preview route, as they are into the Inngest route", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    for (const route of ["/api/webhooks/inngest", PREVIEW]) {
      expect(config, route).toContain(`"${route}": ["./lib/reports/pdf/fonts/**/*"]`);
    }
  });
});
